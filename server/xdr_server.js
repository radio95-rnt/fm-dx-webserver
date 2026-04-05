const storage = require('./storage');
const WebSocket = require('ws');
const crypto = require('crypto');
const xdr = new WebSocket.Server({ noServer: true });
const { serverConfig } = require('./server_config');

let currentUsers = 0;
let clients = []

function send_to_xdr(data) {
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}

function send_xdr_online(fmusers) {
  send_to_xdr(`o${currentUsers},${fmusers}\n`);
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function xdr_auth(ws, salt) {
  return new Promise((resolve, reject) => {
    const expected = crypto.createHash('sha1')
      .update(salt + serverConfig.password.adminPass).digest('hex');

    const timeout = setTimeout(() => {
      reject(new Error('Auth timeout'));
    }, 10_000);

    ws.once('message', (message) => {
      clearTimeout(timeout);
      const received = message.toString().trim();
      if (received === expected) resolve();
      else reject(new Error('Invalid credentials'));
    });
  });
}

xdr.on('connection', async (ws, request) => {
  const { initialData } = require('./datahandler');

  const salt = randomString(16);
  ws.send(`${salt}\n`);

  try {
    await xdr_auth(ws, salt);
  } catch (err) {
    ws.send("a0\n");
    ws.close(1008, err.message);
    return;
  }

  currentUsers++;
  send_xdr_online(initialData.users);
  ws.send(`T${initialData.freq * 1000}\n`);
  ws.send(`G${initialData.eq}${initialData.ims}\n`);
  ws.send(`Z${initialData.ant}\n`);
  ws.send(`A${initialData.agc}\n`);
  ws.send(`F${initialData.bw}\n`);
  ws.send(`W${initialData.bw}\n`);
  ws.send(`wL${serverConfig.lockToAdmin ? "1" : "0"}\n`); // Don't know how XDR-GTK will handle this, but lets hope it will be fine
  ws.send(`wT${serverConfig.publicTuner ? "0" : "1"}\n`); // Again
  ws.send(`OK\n`); // Make sure dumbass clients don't need to wait long for the OK, does the comms really REQUIRE you to start the receiver for you to know you are in?
  clients.push(ws);

  ws.on('message', (message) => {
    const data = message.toString();

    if(data.startsWith("w")) {
      switch(data.trim()) {
        case "wL1":
          serverConfig.lockToAdmin = true;
          send_to_xdr("wL1\n")
          break;
        case "wL0":
          serverConfig.lockToAdmin = false;
          send_to_xdr("wL0\n")
          break;
        // TODO: Do the wT, but not rn because i don't feel like doing the tunerlockTracker
      }
    }

    if (!storage.ctl_output.write(data)) {
      ws.pause();
      storage.ctl_output.once('drain', () => ws.resume());
    }
  });

  ws.on('close', () => {
    currentUsers--;
    send_xdr_online(initialData.users);

    clients = clients.filter(client => client !== ws);
  });
});

storage.websocket_delegation.set("/xdr", xdr);

module.exports = { send_to_xdr, send_xdr_online };