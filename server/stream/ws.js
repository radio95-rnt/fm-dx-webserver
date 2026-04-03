const WebSocket = require('ws');
const { serverConfig } = require('../server_config');
const audio_pipe = require('./index.js');
const { getIpAddress } = require("../helpers.js")

const audioWss = new WebSocket.Server({ noServer: true, skipUTF8Validation: true });

audio_pipe.on('data', (chunk) => {
    audioWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(chunk, {binary: true, compress: false});
    });
});

audio_pipe.on('end', () => {
    audioWss.clients.forEach((client) => {
        client.close(1001, "Audio stream ended");
    });
});

module.exports = audioWss;