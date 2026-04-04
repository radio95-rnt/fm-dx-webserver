const storage = require('./storage');
const { initialData } = require('./datahandler');
const WebSocket = require('ws');
const xrd = new WebSocket.Server({ noServer: true });

xrd.on('connection', (ws, request) => {
  const { isAdminAuthenticated } = request.session || {};
  if(!isAdminAuthenticated) {
    ws.close(1008, "No admin");
    return;
  }

  ws.send(`o${initialData.users},0\n`);
  ws.send(`T${initialData.freq * 1000}\n`);
  ws.send(`G${initialData.eq}${initialData.ims}\n`);
  ws.send(`Z${initialData.ant}\n`);
  ws.send(`A${initialData.agc}\n`);
  ws.send(`F${initialData.bw}\n`);
  ws.send(`W${initialData.bw}\n`);
  ws.send(`OK\n`);

  ws.on('message', (message) => storage.ctl_output.write(`${message}\n`));
});

storage.websocket_delegation.set("/xrd", xrd);

function send_to_xrd(data) {
    xrd.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}

module.exports = send_to_xrd;