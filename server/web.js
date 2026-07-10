const http = require('http');
const WebSocket = require('ws');
const storage = require('./storage.js');
const { serverConfig, configExists } = require('./server_config');
const path = require('path');
const endpoints = require('./endpoints');
const pluginsApi = require('./plugins_api');
const { logError, logInfo, logWarn } = require('./console');
const { send_to_xdr } = require("./xdr_server")
const helpers = require('./helpers');
const dataHandler = require('./datahandler');

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const app = express();
const httpServer = http.createServer(app);

app.use(bodyParser.urlencoded({ extended: true }));
const sessionMiddleware = session({
  secret: 'GTce3tN6U8odMwoI', // Cool
  resave: false,
  saveUninitialized: true,
});
app.use(sessionMiddleware);
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use('/', endpoints);
app.use(express.static(path.join(__dirname, '../web')));

const wss = new WebSocket.Server({ noServer: true });
const rdsWss = new WebSocket.Server({ noServer: true });
const pluginsWss = new WebSocket.Server({ noServer: true, perMessageDeflate: true });
pluginsApi.registerServerContext({ wss, pluginsWss, httpServer, serverConfig });

require('./chat');

const tunerLockTracker = new WeakMap();
const ipConnectionCounts = new Map(); // Per-IP limit variables
const ipLogTimestamps = new Map();
const MAX_CONNECTIONS_PER_IP = 4;
const IP_LOG_INTERVAL_MS = 60000;
const MAX_USERS = 12; // Server max

setInterval(() => {
  const now = Date.now();

  for (const [ip, count] of ipConnectionCounts.entries()) {
    const lastSeen = ipLogTimestamps.get(ip) || 0;
    const inactive = now - lastSeen > 60 * 60 * 1000;

    if (count === 0 && inactive) {
      ipConnectionCounts.delete(ip);
      ipLogTimestamps.delete(ip);
    }
  }
}, 30 * 60 * 1000); // Run every half hour (this is a stop sign ahh comment, i wrote it lol)

let currentUsers = 0;
let timeoutAntenna;

wss.on('connection', (ws, request) => {
    let clientIp = helpers.getIpAddress(request);
    const userCommandHistory = {};

    // Per-IP limit connection open
    if (clientIp) {
        const isLocalIp = (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('172.16.'));
        if (!isLocalIp) {
            if (!ipConnectionCounts.has(clientIp)) ipConnectionCounts.set(clientIp, 0);
            const currentCount = ipConnectionCounts.get(clientIp);
            if (currentCount >= MAX_CONNECTIONS_PER_IP) {
                ws.close(1008, 'Too many open connections from this IP');
                const lastLogTime = ipLogTimestamps.get(clientIp) || 0;
                const now = Date.now();
                if (now - lastLogTime > IP_LOG_INTERVAL_MS) {
                    logWarn(`Web client \x1b[31mclosed: limit exceeded\x1b[0m (${clientIp}) \x1b[90m[${currentUsers}]`);
                    ipLogTimestamps.set(clientIp, now);
                } return;
            } ipConnectionCounts.set(clientIp, currentCount + 1);
        }
    }

    if(currentUsers >= MAX_USERS) {
        ws.send("a0"); // This means not authenticated in XDR
        ws.close(1008, 'Too many users using this server at the moment.');
        return;
    }

    if (clientIp !== '127.0.0.1' ||
      (request.headers && request.headers['origin'] && request.headers['origin'].trim() !== '')) {
      currentUsers++;
    }

    if (timeoutAntenna) clearTimeout(timeoutAntenna);

    helpers.handleConnect(clientIp, currentUsers, ws, request, (result) => {
      if (result === "User banned") {
          ws.close(1008, 'Banned IP');
          return;
      }
      dataHandler.showOnlineUsers(currentUsers);

      if (currentUsers === 1 && serverConfig.autoShutdown === true && serverConfig.xdrd.wirelessConnection) serverConfig.xdrd.wirelessConnection ? connectToXdrd() : storage.ctl_output.write('x\n');
    });

    const userCommands = {};
    let lastWarn = { time: 0 };

    ws.on('message', (message) => {
        const command = helpers.antispamProtection(message, clientIp, ws, userCommands, lastWarn, userCommandHistory, '18', 'text', 16 * 1024);

        if (!clientIp.includes("127.0.0.1")) {
            if (((command.startsWith('X') || command.startsWith('Y')) && !helpers.isAdmin(req)) ||
               ((command.startsWith('F') || command.startsWith('W')) && serverConfig.bwSwitch === false)) {
                logWarn(`User \x1b[90m${clientIp}\x1b[0m attempted to send a potentially dangerous command: ${command.slice(0, 64)}.`);
                return;
            }
        }

        if (command.includes("\'")) return;

        const isAdminAuthenticated = helpers.isAdmin(request)
        const { isTuneAuthenticated } = request.session || {};

        if (command.startsWith('w') && (isAdminAuthenticated || isTuneAuthenticated)) {
            switch (command) {
                case 'wL1':
                    if (isAdminAuthenticated) {
                        serverConfig.lockToAdmin = true;
                        send_to_xdr("wL1\n");
                    } break;
                case 'wL0':
                    if (isAdminAuthenticated) {
                        serverConfig.lockToAdmin = false;
                        send_to_xdr("wL0\n");
                    } break;
                case 'wT0':
                    serverConfig.publicTuner = true;
                    if(!isAdminAuthenticated) tunerLockTracker.delete(ws);
                    send_to_xdr("wT0\n");
                    break;
                case 'wT1':
                    serverConfig.publicTuner = false;
                    if(!isAdminAuthenticated) tunerLockTracker.set(ws, true);
                    send_to_xdr("wT1\n");
                    break;
                default:
                    break;
            }
        }

        if (command.startsWith('T')) {
            const tuneFreq = Number(command.slice(1)) / 1000;
            const { tuningLimit, tuningLowerLimit, tuningUpperLimit } = serverConfig.webserver;

            if (tuningLimit && (tuneFreq < tuningLowerLimit || tuneFreq > tuningUpperLimit) || isNaN(tuneFreq)) return;
        }

        if ((serverConfig.publicTuner && !serverConfig.lockToAdmin) || isAdminAuthenticated || (!serverConfig.publicTuner && !serverConfig.lockToAdmin && isTuneAuthenticated)) storage.ctl_output.write(`${command}\n`);
    });

    ws.on('close', (code) => {
      // Per-IP limit connection closed
      if (clientIp) {
        const isLocalIp = (
          clientIp === '127.0.0.1' ||
          clientIp === '::1' ||
          clientIp.startsWith('192.168.') ||
          clientIp.startsWith('10.') ||
          clientIp.startsWith('172.16.')
        );
        if (!isLocalIp) {
          const current = ipConnectionCounts.get(clientIp) || 1;
          ipConnectionCounts.set(clientIp, Math.max(0, current - 1));
        }
      }

      if (clientIp !== '127.0.0.1' ||
        (request.socket && request.socket.remoteAddress && request.socket.remoteAddress !== '::ffff:127.0.0.1') ||
        (request.headers && request.headers['origin'] && request.headers['origin'].trim() !== '')) {
        currentUsers--;
      } dataHandler.showOnlineUsers(currentUsers);

      const index = storage.connectedUsers.findIndex(user => user.ip === clientIp);
      if (index !== -1) storage.connectedUsers.splice(index, 1);

      if (currentUsers === 0) {
          storage.connectedUsers = [];

          if (serverConfig.bwAutoNoUsers === "1") storage.ctl_output.write("W0\n"); // Auto BW 'Enabled'

          // cEQ and iMS combinations
          if (serverConfig.ceqNoUsers === "1" && serverConfig.imsNoUsers === "1") storage.ctl_output.write("G00\n"); // Both Disabled
          else if (serverConfig.ceqNoUsers === "1" && serverConfig.imsNoUsers === "0") storage.ctl_output.write(`G0${dataHandler.dataToSend.ims}\n`);
          else if (serverConfig.ceqNoUsers === "0" && serverConfig.imsNoUsers === "1") storage.ctl_output.write(`G${dataHandler.dataToSend.eq}0\n`);
          else if (serverConfig.ceqNoUsers === "2" && serverConfig.imsNoUsers === "0") storage.ctl_output.write(`G1${dataHandler.dataToSend.ims}\n`);
          else if (serverConfig.ceqNoUsers === "0" && serverConfig.imsNoUsers === "2") storage.ctl_output.write(`G${dataHandler.dataToSend.eq}1\n`);
          else if (serverConfig.ceqNoUsers === "2" && serverConfig.imsNoUsers === "1") storage.ctl_output.write("G10\n"); // Only cEQ enabled
          else if (serverConfig.ceqNoUsers === "1" && serverConfig.imsNoUsers === "2") storage.ctl_output.write("G01\n"); // Only iMS enabled
          else if (serverConfig.ceqNoUsers === "2" && serverConfig.imsNoUsers === "2") storage.ctl_output.write("G11\n"); // Both Enabled

          // Handle stereo mode
          if (serverConfig.stereoNoUsers === "1") storage.ctl_output.write("B0\n");
          else if (serverConfig.stereoNoUsers === "2") storage.ctl_output.write("B1\n");

          // Handle Antenna selection
          if (timeoutAntenna) clearTimeout(timeoutAntenna);
          timeoutAntenna = setTimeout(() => {
              if (serverConfig.antennaNoUsers === "1") storage.ctl_output.write("Z0\n");
              else if (serverConfig.antennaNoUsers === "2") storage.ctl_output.write("Z1\n");
              else if (serverConfig.antennaNoUsers === "3") storage.ctl_output.write("Z2\n");
              else if (serverConfig.antennaNoUsers === "4") storage.ctl_output.write("Z3\n");
          }, serverConfig.antennaNoUsersDelay ? 15000 : 0);
      }

      if (tunerLockTracker.has(ws)) {
        logInfo(`User who locked the tuner left. Unlocking the tuner.`);
        tunerLockTracker.delete(ws);
        serverConfig.publicTuner = true;
      }

      if (currentUsers === 0 && serverConfig.enableDefaultFreq === true &&
          serverConfig.autoShutdown !== true && serverConfig.xdrd.wirelessConnection === true) {
          setTimeout(function() {
              if (currentUsers === 0) {
                  storage.ctl_output.write('T' + Math.round(serverConfig.defaultFreq * 1000) + '\n');
                  dataHandler.resetToDefault(dataHandler.dataToSend);
                  dataHandler.dataToSend.freq = Number(serverConfig.defaultFreq).toFixed(3);
                  dataHandler.initialData.freq = Number(serverConfig.defaultFreq).toFixed(3);
              }
          }, 10000);
      }

      if (currentUsers === 0 && serverConfig.autoShutdown === true && serverConfig.xdrd.wirelessConnection) client.write('X\n');

      if (code !== 1008) logInfo(`Web client \x1b[31mdisconnected\x1b[0m (${clientIp}) \x1b[90m[${currentUsers}]`);
    });

    ws.on('error', console.error);
});

// Additional web socket for using plugins
pluginsWss.on('connection', (ws, request) => {
    const clientIp = helpers.getIpAddress(request);
    const userCommandHistory = {};
    // Anti-spam tracking for each client
    const userCommands = {};
    let lastWarn = { time: 0 };

    ws.on('message', message => {
        // Anti-spam
        const msg2 = helpers.antispamProtection(message, clientIp, ws, userCommands, lastWarn, userCommandHistory, '10', 'data_plugins', 1024 * 1024 * 2);
        if(!msg2) return;

        try {
            let messageData = JSON.parse(msg2); // Attempt to parse the JSON. This code will attemp to parse json using the JSON.parse which coincidentally actually parses the json

            if (messageData.type === "GPS" && messageData.value) {
                const gpsData = messageData.value;
                const { status, time, lat, lon, alt, mode } = gpsData;

                if (status === "active") {
                    Latitude = parseFloat(lat);
                    Longitude = parseFloat(lon);
                }
            }
        } catch (error) {}

        // Broadcast the message to all other clients
        pluginsWss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(message); // Send the message to all clients
        });
    });

    ws.on('error', error => logError('WebSocket Extra error: ' + error));
});

storage.websocket_delegation.set("/text", wss);
storage.websocket_delegation.set("/rds", rdsWss);
storage.websocket_delegation.set("/rdsspy", rdsWss);
storage.websocket_delegation.set("/data_plugins", pluginsWss);
require('./stream/ws.js');

httpServer.on('upgrade', (request, socket, head) => {
  if (serverConfig.webserver.banlist?.includes(helpers.getIpAddress(request))) {
    socket.destroy();
    return;
  }

  const upgradeWss = storage.websocket_delegation.get(request.url);
  if(upgradeWss) {
    sessionMiddleware(request, {}, () => {
        // Sure want to, but no
        upgradeWss.handleUpgrade(request, socket, head, (ws) => upgradeWss.emit('connection', ws, request));
    });
  } else socket.destroy();
});

const logServerStart = (address) => logInfo(`Web server has started on address \x1b[34mhttp://${address}:${serverConfig.webserver.webserverPort}\x1b[0m.`);

const startServer = (address) => {
  httpServer.listen(serverConfig.webserver.webserverPort, address, () => {
    if (!configExists()) {
        logInfo(`Open your browser and proceed to \x1b[34mhttp://${address}:${serverConfig.webserver.webserverPort}\x1b[0m to continue with setup.`);
        logInfo("Remember to restart afterwards!");
    } else logServerStart(address);
  });
};

module.exports = startServer;