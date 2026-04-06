const terminalWidth = require('readline').createInterface({input: process.stdin, output: process.stdout}).output.columns;

console.log('\x1b[32m' + require('figlet').textSync("FM-DX Webserver"));
console.log('\x1b[2mby (Noobish @ \x1b[4mFMDX.org\x1b[0m\x1b[32m\x1b[2m) + KubaPro010\x1b[0m');
console.log("v" + require('../package.json').version)
console.log('\x1b[90m' + '─'.repeat(terminalWidth - 1) + '\x1b[0m');

const { serverConfig } = require('./server_config');
const tunnel = require('./tunnel');
tunnel.download();

require("./device");

{
  const helpers = require('./helpers');
  const plugins = helpers.findServerFiles(serverConfig.plugins);
  if (plugins.length > 0) setTimeout(helpers.startPluginsWithDelay, 3000, plugins, 3000);
}

require('./stream/index');
const startServer = require("./web");

startServer(serverConfig.webserver.webserverIp === '0.0.0.0' ? 'localhost' : serverConfig.webserver.webserverIp);

tunnel.connect();
require('./server_list').update();