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
  send_to_xdr(`o${currentUsers},${fmusers}\n`); // First value is normal users, and the second is the guest users, XDR-GTK displays them either as `2 users` or `2 ( + 1) users` if the guest number is non zero
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

xdr.on('connection', async (ws) => {
  const { initialData } = require('./datahandler');

  const salt = randomString(16); // 16 characters are needed, because XDR-GTK does not wait for the new line, but rather the 16 characters with a new line
  ws.send(`${salt}\n`);

  try {
    await xdr_auth(ws, salt);
  } catch (err) {
    ws.send("a0\n"); // a0 is sent when you have not authenticated
    // a1 is sent when you also didnt authenticate, but you're a guest now! and not completly kicked out. im giving these comments because i think sjef is reading this, and he got the protocol VERY WRONG in his plugin for xdrgtk
    ws.close(1008, err.message);
    return;
  }


  ws.send(`OK\n`)
  currentUsers++;
  send_xdr_online(initialData.users); // Broadcast
  ws.send(`T${initialData.freq * 1000}\n`);
  ws.send(`G${initialData.eq}${initialData.ims}\n`);
  ws.send(`Z${initialData.ant}\n`);
  ws.send(`A${initialData.agc}\n`);
  ws.send(`F${initialData.bw}\n`);
  ws.send(`W${initialData.bw}\n`);
  ws.send(`wL${serverConfig.lockToAdmin ? "1" : "0"}\n`);
  ws.send(`wT${serverConfig.publicTuner ? "0" : "1"}\n`);
  ws.send(`OK\n`)
  clients.push(ws);

  ws.on('message', (message) => {
    const data = message.toString();

    if(data.startsWith("w")) {
      switch(data.trim()) {
        case "wL1":
          serverConfig.lockToAdmin = true;
          send_to_xdr("wL1\n")
          return;
        case "wL0":
          serverConfig.lockToAdmin = false;
          send_to_xdr("wL0\n")
          return;
        case "wT1":
          serverConfig.publicTuner = false;
          send_to_xdr("wT1\n")
          return;
        case "wT0":
          serverConfig.publicTuner = true;
          send_to_xdr("wT0\n")
          return;
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
storage.websocket_delegation.set("/xdrgtk", xdr);

module.exports = { send_to_xdr, send_xdr_online };