const storage = require('./storage');
const WebSocket = require('ws');
const rawComm = new WebSocket.Server({ noServer: true });

rawComm.on('connection', (ws, request) => {
  const { isAdminAuthenticated } = request.session || {};
  if(!isAdminAuthenticated) {
    ws.close(1008, "No admin");
    return;
  }

  ws.on('message', (message) => {
    storage.ctl_output.write(`${message.toString()}\n`);
  });
});

storage.websocket_delegation.set("/rawcomm", rawComm);

function send_to_rawcomm(data) {
    rawComm.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}

module.exports = send_to_rawcomm;