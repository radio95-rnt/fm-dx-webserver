const { SerialPort } = require('serialport');
const { serverConfig, configExists } = require('./server_config');
const { logError, logInfo, logWarn } = require('./console');
const pluginsApi = require('./plugins_api');
const dataHandler = require('./datahandler');
const client = new (require('net')).Socket();
const helpers = require('./helpers');

let serialport;

connectToXdrd();
connectToSerial();

dataHandler.state.isSerialportRetrying = false;

setInterval(() => {
  if (!dataHandler.state.isSerialportAlive && serverConfig.xdrd.wirelessConnection === false) {
    dataHandler.state.isSerialportAlive = true;
    dataHandler.state.isSerialportRetrying = true;
    if (serialport && serialport.isOpen) {
      logWarn('Communication lost from ' + serverConfig.xdrd.comPort + ', force closing serialport.');
      setTimeout(() => {
        serialport.close((err) => {
          if (err) logError('Error closing serialport: ', err.message);
        });
      }, 1000);
    } else logWarn('Communication lost from ' + serverConfig.xdrd.comPort + '.');
  }
}, 2000);

// Serial Connection
function connectToSerial() {
  if (serverConfig.xdrd.wirelessConnection === true) return;

  serialport = new SerialPort({
    path: serverConfig.xdrd.comPort,
    baudRate: 115200,
    autoOpen: false,
    dtr: false, rts: false
  });

  serialport.open((err) => {
    if (err) {
      logError('Error opening port: ' + err.message);
      setTimeout(() => {
          connectToSerial();
      }, 5000);
      return;
    }

    logInfo('Using serial port: ' + serverConfig.xdrd.comPort);
    dataHandler.state.isSerialportAlive = true;
    pluginsApi.setOutput(serialport);
    setTimeout(() => {
        serialport.write('x\n');
    }, 1000);

    setTimeout(() => {
      serialport.write('Q0\n');
      serialport.write('M0\n');
      serialport.write(`Z${serverConfig.antennaStartup}\n`); // Antenna on startup

      if (serverConfig.defaultFreq && serverConfig.enableDefaultFreq === true) {
        serialport.write('T' + Math.round(serverConfig.defaultFreq * 1000) + '\n');
        dataHandler.initialData.freq = Number(serverConfig.defaultFreq).toFixed(3);
        dataHandler.dataToSend.freq = Number(serverConfig.defaultFreq).toFixed(3);
      } else if (dataHandler.state.lastFrequencyAlive && dataHandler.state.isSerialportRetrying) { // Serialport retry code when port is open but communication is lost
        serialport.write('T' + (dataHandler.state.lastFrequencyAlive * 1000) + '\n');
      } else serialport.write('T87500\n');
      dataHandler.state.isSerialportRetrying = false;

      if (serverConfig.device === 'si47xx') serialport.write('A0\n');
      serialport.write('F-1\n');
      serialport.write('W0\n');
      serverConfig.webserver.rdsMode ? serialport.write('D1\n') : serialport.write('D0\n');
      serialport.write(`G${serverConfig.ceqStartup}${serverConfig.imsStartup}\n`);
      serialport.write(`B${serverConfig.stereoStartup}\n`);
      serverConfig.audio.startupVolume
        ? serialport.write('Y' + (serverConfig.audio.startupVolume * 100).toFixed(0) + '\n')
        : serialport.write('Y100\n');
    }, 6000);

    serialport.on('data', helpers.resolveDataBuffer);
    serialport.on('error', (error) => logError(error.message));
  });

  // Handle port closure
  serialport.on('close', () => {
    pluginsApi.setOutput(null);
    logWarn('Disconnected from ' + serverConfig.xdrd.comPort + '. Attempting to reconnect.');
    setTimeout(() => {
        dataHandler.state.isSerialportRetrying = true;
        connectToSerial();
    }, 5000);
  });
  return serialport;
}

// xdrd connection
let authFlags = {};

function connectToXdrd() {
  const { xdrd } = serverConfig;

  if (xdrd.wirelessConnection && configExists()) {
    client.connect(xdrd.xdrdPort, xdrd.xdrdIp, () => {
      logInfo('Connection to xdrd established successfully.');
      pluginsApi.setOutput(client);

      authFlags = {
        authMsg: false,
        firstClient: false,
        receivedSalt: '',
        receivedPassword: false,
        messageCount: 0,
      };
    });
  }
}

client.on('data', (data) => {
  const { xdrd } = serverConfig;

  helpers.resolveDataBuffer(data);
  if (authFlags.authMsg == true && authFlags.messageCount > 1) return;

  authFlags.messageCount++;
  const receivedData = data.toString();
  const lines = receivedData.split('\n');

  for (const line of lines) {
    if (authFlags.receivedPassword === false) {
      authFlags.receivedSalt = line.trim();
      authFlags.receivedPassword = true;
      helpers.authenticateWithXdrd(client, authFlags.receivedSalt, xdrd.xdrdPassword);
    } else {
      if (line.startsWith('a')) {
        authFlags.authMsg = true;
        logWarn('Authentication with xdrd failed. Is your password set correctly?');
      } else if (line.startsWith('o1,')) authFlags.firstClient = true;
      else if (line.startsWith('T') && line.length <= 7) {
        const freq = line.slice(1) / 1000;
        dataHandler.dataToSend.freq = freq.toFixed(3);
      } else if (line.startsWith('OK')) {
        authFlags.authMsg = true;
        logInfo('Authentication with xdrd successful.');
      } else if (line.startsWith('G')) {
        dataHandler.initialData.eq = line.charAt(1);
        dataHandler.dataToSend.eq = line.charAt(1);
        dataHandler.initialData.ims = line.charAt(2);
        dataHandler.dataToSend.ims = line.charAt(2);
      } else if (line.startsWith('Z')) {
        let modifiedLine = line.slice(1);
        dataHandler.initialData.ant = modifiedLine;
        dataHandler.dataToSend.ant = modifiedLine;
      }

      if (authFlags.authMsg === true && authFlags.firstClient === true) {
        client.write('x\n');
        client.write(serverConfig.defaultFreq && serverConfig.enableDefaultFreq === true ? 'T' + Math.round(serverConfig.defaultFreq * 1000) + '\n' : 'T87500\n');
        dataHandler.initialData.freq = serverConfig.defaultFreq && serverConfig.enableDefaultFreq === true ? Number(serverConfig.defaultFreq).toFixed(3) : (87.5).toFixed(3);
        dataHandler.dataToSend.freq = serverConfig.defaultFreq && serverConfig.enableDefaultFreq === true ? Number(serverConfig.defaultFreq).toFixed(3) : (87.5).toFixed(3);
        if (serverConfig.device === 'si47xx') serialport.write('A0\n');
        client.write(serverConfig.audio.startupVolume ? 'Y' + (serverConfig.audio.startupVolume * 100).toFixed(0) + '\n' : 'Y100\n');
        serverConfig.webserver.rdsMode ? client.write('D1\n') : client.write('D0\n');
        return;
      }
    }
  }
});

client.on('close', () => {
  pluginsApi.setOutput(null);
  if(serverConfig.autoShutdown === false) {
    logWarn('Disconnected from xdrd. Attempting to reconnect.');
    setTimeout(connectToXdrd, 2000);
  } else logWarn('Disconnected from xdrd.');
});

client.on('error', (err) => {
  switch (true) {
    case err.message.includes("ECONNRESET"):
      logError("Connection to xdrd lost. Reconnecting...");
      break;
    case err.message.includes("ETIMEDOUT"):
      logError("Connection to xdrd @ " + serverConfig.xdrd.xdrdIp + ":" + serverConfig.xdrd.xdrdPort + " timed out.");
      break;
    case err.message.includes("ECONNREFUSED"):
      logError("Connection to xdrd @ " + serverConfig.xdrd.xdrdIp + ":" + serverConfig.xdrd.xdrdPort + " failed. Is xdrd running?");
      break;
    case err.message.includes("EINVAL"):
      logError("Attempts to reconnect are failing repeatedly. Consider checking your settings or restarting xdrd.");
      break;
    default:
      logError("Unhandled error: ", err.message);
      break;
  }
});
