const tunnel = require('./tunnel');
tunnel.download();

require('./stream/index');
require("./device");

const { serverConfig } = require('./server_config');

{
  const helpers = require('./helpers');
  const plugins = helpers.findServerFiles(serverConfig.plugins);
  if (plugins.length > 0) setTimeout(helpers.startPluginsWithDelay, 3000, plugins, 3000);
}

require("./web")(serverConfig.webserver.webserverIp);

tunnel.connect();
require('./server_list')();