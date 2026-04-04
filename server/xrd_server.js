const storage = require('./storage');
const WebSocket = require('ws');
const xrd = new WebSocket.Server({ noServer: true });

let currentUsers = 0;

function send_to_xrd(data) {
    xrd.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}

function send_xrd_online(fmusers) {
  send_to_xrd(`o${currentUsers},${fmusers}\n`);
}

xrd.on('connection', (ws, request) => {
  const { initialData } = require('./datahandler');
  const { isAdminAuthenticated } = request.session || {};
  if(!isAdminAuthenticated) {
    ws.close(1008, "No admin");
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

  ws.on('message', (message) => storage.ctl_output.write(message));
  ws.on('close', (code, reason) => {
    currentUsers--;
    send_xrd_online(initialData.users);
  });
});

storage.websocket_delegation.set("/xrd", xrd);

module.exports = { send_to_xrd, send_xrd_online };