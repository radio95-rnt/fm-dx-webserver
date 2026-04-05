const storage = require('./storage');
const WebSocket = require('ws');
const crypto = require('crypto');
const xrd = new WebSocket.Server({ noServer: true });
const { serverConfig } = require('./server_config');

let currentUsers = 0;
let clients = []

function send_to_xrd(data) {
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}

function send_xrd_online(fmusers) {
  send_to_xrd(`o${currentUsers},${fmusers}\n`);
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function xrd_auth(ws, salt) {
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

xrd.on('connection', async (ws, request) => {
  const { initialData } = require('./datahandler');

  const salt = randomString(16);
  ws.send(`${salt}\n`);

  try {
    await xrd_auth(ws, salt);
  } catch (err) {
    ws.send("a0\n");
    ws.close(1008, err.message);
    return;
  }

  currentUsers++;
  send_xrd_online(initialData.users);
  ws.send(`T${initialData.freq * 1000}\n`);
  ws.send(`G${initialData.eq}${initialData.ims}\n`);
  ws.send(`Z${initialData.ant}\n`);
  ws.send(`A${initialData.agc}\n`);
  ws.send(`F${initialData.bw}\n`);
  ws.send(`W${initialData.bw}\n`);
  ws.send(`OK\n`);
  clients.push(ws);

  ws.on('message', (message) => {
    const data = message.toString();

    if (!storage.ctl_output.write(data)) {
      ws.pause();
      storage.ctl_output.once('drain', () => ws.resume());
    }
  });

  ws.on('close', () => {
    currentUsers--;
    send_xrd_online(initialData.users);
  });
});

storage.websocket_delegation.set("/xrd", xrd);

module.exports = { send_to_xrd, send_xrd_online };