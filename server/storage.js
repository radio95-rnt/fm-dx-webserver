let connectedUsers = [];
let chatHistory = [];
let websocket_delegation = new Map();
var ctl_output;
var tx_search_hook = {};

module.exports = { connectedUsers, chatHistory, websocket_delegation, ctl_output, tx_search_hook };