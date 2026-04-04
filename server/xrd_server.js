const storage = require('./storage');
const { dataToSend } = require('./datahandler');
const WebSocket = require('ws');
const xrd = new WebSocket.Server({ noServer: true });

xrd.on('connection', (ws, request) => {
  const { isAdminAuthenticated } = request.session || {};
  if(!isAdminAuthenticated) {
    ws.close(1008, "No admin");
    return;
  }

  ws.send(`o${dataToSend.users},0\n`);
  ws.send(`T${dataToSend.freq * 1000}\n`);
  ws.send(`G${dataToSend.eq}${dataToSend.ims}\n`);
  ws.send(`Z${dataToSend.ant}\n`);
  ws.send(`A${dataToSend.agc}\n`);
  ws.send(`F${dataToSend.bw}\n`);
  ws.send(`W${dataToSend.bw}\n`);
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