const fs = require('fs');
const path = require('path');
const consoleCmd = require('./console');

function readJSFiles(dir) {
    return fs.readdirSync(dir).filter(file => file.endsWith('.js'));
}

function parsePluginConfig(filePath) {
    const pluginConfig = {};

    // Assuming pluginConfig is a JavaScript object defined in each .js file
    try {
        const pluginExports = require(filePath);
        Object.assign(pluginConfig, pluginExports.pluginConfig);

        if(pluginConfig.server_embedded) {
            setTimeout(function() {
                consoleCmd.logInfo(`Server plugin ${pluginConfig.name} ${pluginConfig.version} initialized successfully.`);
            }, 500)
            return pluginConfig;
        }

        if (pluginConfig.frontEndPath) {
            const sourcePath = path.join(path.dirname(filePath), pluginConfig.frontEndPath);
            const destinationDir = path.join(
                __dirname,
                '../web/js/plugins',
                path.relative(pluginsDir, path.dirname(sourcePath))
            );
            // Check if the source path exists
            if (!fs.existsSync(sourcePath)) {
                console.error(`Error: source path ${sourcePath} does not exist.`);
                return pluginConfig;
            }

            // Check if the destination directory exists, if not, create it
            if (!fs.existsSync(destinationDir)) fs.mkdirSync(destinationDir, { recursive: true }); // Create directory recursively

            const destinationFile = path.join(destinationDir, path.basename(sourcePath));

            // Platform-specific handling for symlinks/junctions
            if (process.platform !== 'win32') {
                // On Linux, create a symlink
                try {
                    if (fs.existsSync(destinationFile)) fs.unlinkSync(destinationFile); // Remove existing file/symlink
                    fs.symlinkSync(sourcePath, destinationFile);
                    setTimeout(function() {
                        consoleCmd.logInfo(`Plugin ${pluginConfig.name} ${pluginConfig.version} initialized successfully.`);
                    }, 500)
                } catch (err) {
                    console.error(`Error creating symlink at ${destinationFile}: ${err.message}`);
                }
            }
        }
    } catch (err) {
        console.error(`Error parsing plugin config from ${filePath}: ${err.message}`);
    }

    return pluginConfig;
}

// Ensure the web/js/plugins directory exists
const webJsPluginsDir = path.join(__dirname, '../web/js/plugins');
if (!fs.existsSync(webJsPluginsDir)) fs.mkdirSync(webJsPluginsDir, { recursive: true });

const pluginsDir = path.join(__dirname, '../plugins');

if (process.platform === 'win32') {
    const destinationPluginsDir = path.join(__dirname, '../web/js/plugins');

    // On Windows, create a junction
    try {
        if (fs.existsSync(destinationPluginsDir)) fs.rmSync(destinationPluginsDir, { recursive: true });
        fs.symlinkSync(pluginsDir, destinationPluginsDir, 'junction');
    } catch (err) {
        console.error(`Error creating junction at ${destinationPluginsDir}: ${err.message}`);
    }
}

const pluginConfigs = [];
readJSFiles(pluginsDir).forEach(file => {
    const dir = fs.statSync(filePath).isDirectory();
    var filePath = path.join(pluginsDir, file);
    if(dir) filePath = path.join(pluginsDir, file, file);

    const config = parsePluginConfig(filePath);
    if(dir) config = {...config, prefix: file}
    else config = {...config, prefix: ""}
    pluginConfigs.push(config);
});

module.exports = pluginConfigs;
