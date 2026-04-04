const storage = require('./storage');
const datahandler = require('./datahandler');
const WebSocket = require('ws');
const xrd = new WebSocket.Server({ noServer: true });

xrd.on('connection', (ws, request) => {
  const { isAdminAuthenticated } = request.session || {};
  if(!isAdminAuthenticated) {
    ws.close(1008, "No admin");
    return;
  }

  ws.send(`o${datahandler.initialData.users},0\n`);
  ws.send(`T${datahandler.initialData.freq * 1000}\n`);
  ws.send(`G${datahandler.initialData.eq}${datahandler.initialData.ims}\n`);
  ws.send(`Z${datahandler.initialData.ant}\n`);
  ws.send(`A${datahandler.initialData.agc}\n`);
  ws.send(`F${datahandler.initialData.bw}\n`);
  ws.send(`W${datahandler.initialData.bw}\n`);
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