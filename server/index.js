require("./device");

const { serverConfig } = require('./server_config');

{
  const helpers = require('./helpers');
  const plugins = helpers.findServerFiles(serverConfig.plugins);
  if (plugins.length > 0) setTimeout(helpers.startPluginsWithDelay, 3000, plugins, 3000);
}

require('./stream/index');
require("./web")(serverConfig.webserver.webserverIp);

require('./server_list')();