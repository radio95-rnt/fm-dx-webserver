'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const endpointsRouter = require('./endpoints');

// --- STØTTE FOR FLERE INSTANSER (--config) ---
let configSuffix = '';
const configArgIndex = process.argv.indexOf('--config');
if (configArgIndex !== -1 && process.argv.length > configArgIndex + 1) {
    configSuffix = '_' + process.argv[configArgIndex + 1];
} else if (process.env.CONFIG) {
    configSuffix = '_' + process.env.CONFIG;
}
const CONFIG_FILE = path.join(__dirname, `enhanced_tuning_config${configSuffix}.json`);
// ---------------------------------------------

// Default Configuration
let pluginConfig = {
    // Layout & UI
    LAYOUT_STYLE: 'modern',
    HIDE_ALL_BUTTONS: false,
    SHOW_LOOP_BUTTON: true,
    SHOW_BAND_RANGE: true,
    HIDE_DECIMAL_FOR_HF: false,
    HIDE_DECIMAL_HF_THRESHOLD: 30,
    ENABLE_TUNE_STEP_FEATURE: true,
    TUNE_STEP_TIMEOUT_SECONDS: 20,
    ENABLED_BANDS: ['FM', 'OIRT', 'SW', 'MW', 'LW'],

    // Tuning & Hardware
    TUNING_STANDARD: 'international',
    ENABLE_MW_STEP_TOGGLE: true,
    ENABLE_FREQUENCY_MEMORY: true,
    ENABLE_SMART_KHZ_INPUT: true,
    ENABLE_AM_BW: true,
    FIRMWARE_TYPE: 'FM-DX-Tuner',
    ENABLE_DEFAULT_AM_BW: false,
    DEFAULT_AM_BW_VALUE: '56000',

    // Limits
    overrideServerTuningLimit: true,
    fmLower: 64.0, fmUpper: 108.0,
    amLower: 0.144, amUpper: 30.0,

    // Egendefinerte Bånd & Navn
    customMainBands: {
        'AM_SUPER': { name: 'AM', tune: 1.000, start: 0.144, end: 27.0 },
        'FM': { name: 'FM', tune: 87.500, start: 87.5, end: 108.0 },
        'OIRT': { name: 'OIRT', tune: 65.900, start: 65.9, end: 74.0 },
        'SW': { name: 'SW', tune: 9.400, start: 1.710, end: 27.0 },
        'MW': { name: 'MW', tune: 0.504, start: 0.504, end: 1.701 },
        'LW': { name: 'LW', tune: 0.144, start: 0.144, end: 0.351 }
    },
    customSwBands: {
        '160m': { tune: 1.8, start: 1.8, end: 2.0 }, '120m': { tune: 2.3, start: 2.3, end: 2.5 },
        '90m': { tune: 3.2, start: 3.2, end: 3.4 }, '75m': { tune: 3.9, start: 3.9, end: 4.0 },
        '60m': { tune: 4.75, start: 4.75, end: 5.06 }, '49m': { tune: 5.9, start: 5.9, end: 6.2 },
        '41m': { tune: 7.2, start: 7.2, end: 7.6 }, '31m': { tune: 9.4, start: 9.4, end: 9.9 },
        '25m': { tune: 11.6, start: 11.6, end: 12.1 }, '22m': { tune: 13.57, start: 13.57, end: 13.87 },
        '19m': { tune: 15.1, start: 15.1, end: 15.83 }, '16m': { tune: 17.48, start: 17.48, end: 17.9 },
        '15m': { tune: 18.9, start: 18.9, end: 19.02 }, '13m': { tune: 21.45, start: 21.45, end: 21.85 },
        '11m': { tune: 25.67, start: 25.67, end: 26.1 }
    },

    // Plugins Integration
    ENABLE_AM_SCANNER: false,
    ENABLE_ANALOG_SCALE: true,
    ANALOG_SCALE_AUTOSTART: true,
    SHOW_TUNING_KNOB: true,
    ANALOG_SCALE_ENABLE_FM: true,
    ANALOG_SCALE_BRIGHTNESS: 1.5,
    ENABLE_VU_METER: true,
    VU_METER_GAIN_FM: 1.5,
    VU_METER_GAIN_AM: 1.5,
    VU_METER_MODE: 'RMS',
    ENABLE_MAGIC_EYE: true,
    ENABLE_PS_SCALE: true,
    ENABLE_SPECTRUM_OVERLAY: true,
    ENABLE_SW_STATIONS_SCALE: false,

    // AM Scanner Thresholds
    thr_LW: 35, thr_MW: 35, thr_160m: 35, thr_120m: 35, thr_90m: 35,
    thr_75m: 35, thr_60m: 35, thr_49m: 35, thr_41m: 35, thr_31m: 35,
    thr_25m: 35, thr_22m: 35, thr_19m: 35, thr_16m: 35, thr_15m: 35,
    thr_13m: 35, thr_11m: 35
};

if (fs.existsSync(CONFIG_FILE)) {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        pluginConfig = { ...pluginConfig, ...JSON.parse(data) };
    } catch (err) {
        console.error('[Enhanced Tuning] Feil ved lesing av config:', err);
    }
}

const checkStrictAdmin = (req, res, next) => {
    if (req.session && req.session.isAdminAuthenticated) return next();
    return res.status(401).send('Unauthorized. You must be an administrator.');
};

endpointsRouter.get('/enhanced_tuning/api/auth-check', (req, res) => {
    res.json({
        isAdmin: (req.session && req.session.isAdminAuthenticated) || false,
        isTune: true,
        config: pluginConfig
    });
});

endpointsRouter.post('/enhanced_tuning/api/config', checkStrictAdmin, express.json(), (req, res) => {
    try {
        pluginConfig = { ...pluginConfig, ...req.body };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(pluginConfig, null, 2));
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (err) {
        console.error('[Enhanced Tuning] Feil ved lagring av config:', err);
        res.status(500).json({ success: false });
    }
});

// Admin Panel Side
endpointsRouter.get('/enhanced_tuning/AP', checkStrictAdmin, (req, res) => {
    const createToggleRow = (id, title, desc, isChecked) => `
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-title">${title}</div>
                <div class="setting-desc">${desc}</div>
            </div>
            <label class="switch">
                <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
    `;

    const createInputRow = (id, title, desc, value, type = "text", step = "1") => `
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-title">${title}</div>
                <div class="setting-desc">${desc}</div>
            </div>
            <input type="${type}" id="${id}" value="${value}" step="${step}" class="dark-input">
        </div>
    `;

    const createSelectRow = (id, title, desc, options, selectedValue) => {
        let opts = options.map(opt => `<option value="${opt.val}" ${opt.val === selectedValue ? 'selected' : ''}>${opt.label}</option>`).join('');
        return `
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-title">${title}</div>
                    <div class="setting-desc">${desc}</div>
                </div>
                <select id="${id}" class="dark-input">${opts}</select>
            </div>
        `;
    };

    const createSliderRow = (id, title, desc, min, max, step, value) => `
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-title">${title}</div>
                <div class="setting-desc">${desc}</div>
            </div>
            <div style="display:flex; align-items:center; gap:15px;">
                <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="cursor: pointer;">
                <span id="${id}_display" style="color:var(--accent); font-weight:bold; width: 35px; text-align:right;">${value}</span>
            </div>
        </div>
    `;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Enhanced Tuning Settings</title>
        <style>
            :root { --bg: #121212; --panel-bg: #1e1e1e; --row-bg: #181818; --border: #333; --text: #f0f0f0; --subtext: #999; --accent: #3498db; --accent-hover: #2980b9; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
            .sidebar { width: 260px; background-color: var(--panel-bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
            .sidebar-header { padding: 20px; font-size: 18px; font-weight: bold; border-bottom: 1px solid var(--border); color: var(--accent); }
            .nav-btn { padding: 15px 20px; background: none; border: none; color: var(--subtext); text-align: left; cursor: pointer; font-size: 15px; border-left: 3px solid transparent; transition: all 0.2s; }
            .nav-btn:hover { background-color: var(--row-bg); color: var(--text); }
            .nav-btn.active { border-left-color: var(--accent); color: var(--accent); background-color: rgba(52, 152, 219, 0.1); font-weight: bold; }
            .main-content { flex: 1; padding: 40px; overflow-y: auto; position: relative; }
            .tab-content { display: none; max-width: 900px; margin: 0 auto; }
            .tab-content.active { display: block; animation: fadeIn 0.3s; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            h2 { color: var(--accent); margin-top: 0; margin-bottom: 25px; font-weight: 500; font-size: 24px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
            .setting-row { display: flex; justify-content: space-between; align-items: center; background-color: var(--row-bg); padding: 15px 20px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; transition: border-color 0.2s; }
            .setting-row:hover { border-color: #555; }
            .setting-info { flex: 1; padding-right: 20px; }
            .setting-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
            .setting-desc { font-size: 13px; color: var(--subtext); line-height: 1.4; }
            .dark-input { background-color: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 10px 15px; border-radius: 6px; font-size: 14px; min-width: 150px; outline: none; transition: border-color 0.2s; }
            .dark-input:focus { border-color: var(--accent); }
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .3s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--accent); }
            input:checked + .slider:before { transform: translateX(20px); }
            .threshold-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
            .threshold-card { background: var(--row-bg); border: 1px solid var(--border); padding: 15px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
            .threshold-card span { font-weight: bold; color: var(--accent); }
            .threshold-card input { width: 80px; text-align: center; }
            .btn-save { background-color: var(--accent); color: white; border: none; padding: 12px 25px; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: background 0.2s; }
            .btn-save:hover { background-color: var(--accent-hover); }
            #toast { visibility: hidden; min-width: 250px; background-color: #27ae60; color: #fff; text-align: center; border-radius: 6px; padding: 16px; position: fixed; z-index: 1000; bottom: 40px; left: 50%; transform: translateX(-50%); font-size: 16px; font-weight: bold; opacity: 0; transition: opacity 0.3s; }
            #toast.show { visibility: visible; opacity: 1; }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <div class="sidebar-header">Enhanced Tuning</div>
            <button class="nav-btn active" data-target="tab-ui">1. General UI & Layout</button>
            <button class="nav-btn" data-target="tab-hardware">2. Tuning & Hardware</button>
            <button class="nav-btn" data-target="tab-limits">3. Band Limits</button>
            <button class="nav-btn" data-target="tab-plugins">4. Plugin Integration</button>

            <div style="margin-top: auto; padding: 20px; border-top: 1px solid var(--border);">
                <button class="btn-save" id="saveBtn" style="width: 100%;">Save Settings</button>
            </div>
        </div>

        <div class="main-content">
            <div id="tab-ui" class="tab-content active">
                <h2>General UI & Layout</h2>
                ${createSelectRow('LAYOUT_STYLE', 'Visual Layout Style', 'Choose the layout design for the plugin controls.', [{val: 'modern', label:'Modern (Side Panel)'}, {val:'classic', label:'Classic (Compact)'}], pluginConfig.LAYOUT_STYLE)}
                ${createToggleRow('HIDE_ALL_BUTTONS', 'Hide All Buttons', 'Hides new UI elements. Only effective if Layout is Modern.', pluginConfig.HIDE_ALL_BUTTONS)}
                ${createToggleRow('SHOW_LOOP_BUTTON', 'Show Band Loop Button', 'Enable or disable the frequency loop feature entirely.', pluginConfig.SHOW_LOOP_BUTTON)}
                ${createToggleRow('SHOW_BAND_RANGE', 'Show Band Range', 'Show the start ↔ end frequency text under the main display.', pluginConfig.SHOW_BAND_RANGE)}
                ${createToggleRow('HIDE_DECIMAL_FOR_HF', 'Hide Decimal Point For HF Band', 'For AM/LW/MW/SW frequencies, hide the decimal point in the main frequency display.', pluginConfig.HIDE_DECIMAL_FOR_HF)}
                ${createInputRow('HIDE_DECIMAL_HF_THRESHOLD', 'Hide Decimal Threshold (MHz)', 'Frequencies at or below this value (in MHz) will have the decimal point hidden.', pluginConfig.HIDE_DECIMAL_HF_THRESHOLD, 'number', '0.001')}
                ${createToggleRow('ENABLE_TUNE_STEP_FEATURE', 'Tune Step Feature', 'Click frequency display to change tuning steps.', pluginConfig.ENABLE_TUNE_STEP_FEATURE)}
                ${createInputRow('TUNE_STEP_TIMEOUT_SECONDS', 'Tune Step Timeout', 'Seconds of inactivity before step resets (0 to disable).', pluginConfig.TUNE_STEP_TIMEOUT_SECONDS, 'number')}

                <h3 style="margin-top:30px; color:#aaa; font-size:16px;">Enabled Bands</h3>
                ${createToggleRow('band_FM', 'FM Band', '', pluginConfig.ENABLED_BANDS.includes('FM'))}
                ${createToggleRow('band_OIRT', 'OIRT Band', '', pluginConfig.ENABLED_BANDS.includes('OIRT'))}
                ${createToggleRow('band_SW', 'Shortwave (SW) Band', '', pluginConfig.ENABLED_BANDS.includes('SW'))}
                ${createToggleRow('band_MW', 'Mediumwave (MW) Band', '', pluginConfig.ENABLED_BANDS.includes('MW'))}
                ${createToggleRow('band_LW', 'Longwave (LW) Band', '', pluginConfig.ENABLED_BANDS.includes('LW'))}
            </div>

            <div id="tab-hardware" class="tab-content">
                <h2>Tuning & Hardware Options</h2>
                ${createSelectRow('TUNING_STANDARD', 'Regional Tuning Standard', 'Controls AM/FM steps and ranges.', [{val:'international', label:'International'}, {val:'americas', label:'Americas'}, {val:'japan', label:'Japan'}], pluginConfig.TUNING_STANDARD)}
                ${createToggleRow('ENABLE_SMART_KHZ_INPUT', 'Smart kHz Input', 'Type e.g. "693" instead of "0.693". Auto-converts numbers on AM bands to avoid plugin conflicts.', pluginConfig.ENABLE_SMART_KHZ_INPUT)}
                ${createToggleRow('ENABLE_MW_STEP_TOGGLE', 'MW 9/10kHz Toggle Button', 'Shows a button when in MW to switch step size.', pluginConfig.ENABLE_MW_STEP_TOGGLE)}
                ${createToggleRow('ENABLE_FREQUENCY_MEMORY', 'Frequency Memory', 'Remember last tuned frequency per band.', pluginConfig.ENABLE_FREQUENCY_MEMORY)}

                <h3 style="margin-top:30px; color:#aaa; font-size:16px;">AM Bandwidth Injection</h3>
                ${createToggleRow('ENABLE_AM_BW', 'Enable Custom AM Bandwidth', 'Requires TEF6686_ESP32 firmware.', pluginConfig.ENABLE_AM_BW)}
                ${createSelectRow('FIRMWARE_TYPE', 'Firmware Type', 'Select compatibility mode for bandwidth.', [{val:'TEF6686_ESP32', label:'TEF6686_ESP32 (PE5PVB)'}, {val:'FM-DX-Tuner', label:'FM-DX-Tuner (kkonrad)'}], pluginConfig.FIRMWARE_TYPE)}
                ${createToggleRow('ENABLE_DEFAULT_AM_BW', 'Force Default AM BW', 'Auto-select a specific BW when entering AM.', pluginConfig.ENABLE_DEFAULT_AM_BW)}
                ${createSelectRow('DEFAULT_AM_BW_VALUE', 'Default AM BW Value', 'Applied if forced default is enabled.', [{val:'56000', label:'3 kHz'}, {val:'64000', label:'4 kHz'}, {val:'72000', label:'6 kHz'}, {val:'84000', label:'8 kHz'}], pluginConfig.DEFAULT_AM_BW_VALUE)}
            </div>

            <div id="tab-limits" class="tab-content">
                <h2>Tuning Limits & Bands Configuration</h2>

                ${createToggleRow('overrideServerTuningLimit', 'Override Server Limits', 'Allow plugin to manage its own separate hardware limits for AM and FM. Set the actual values in the core "Webserver -> Tuning Options" panel.', pluginConfig.overrideServerTuningLimit)}

                <h3 style="margin-top:30px; color:#aaa; font-size:16px;">Main Bands Configuration</h3>
<p style="color:var(--subtext); font-size:13px; margin-bottom:15px;">Rename bands (max 5 chars to fit buttons), set default start frequency, and adjust limits.</p>

${['AM_SUPER', 'FM', 'OIRT', 'SW', 'MW', 'LW'].map(key => `
    <div class="setting-row" style="padding: 10px 20px;">
        <div class="setting-info"><div class="setting-title" style="font-size:14px;">${key}</div></div>
        <div style="display:flex; gap:8px; align-items:center;">
            <span style="color:var(--subtext); font-size:11px;">Name</span>
            <input type="text" id="name_${key}" maxlength="5" value="${pluginConfig.customMainBands[key].name}" class="dark-input" style="width:70px; min-width:auto; padding:6px 10px; text-align:center;">
            <span style="color:var(--subtext); font-size:11px;">Default Tune</span>
            <input type="number" id="tune_${key}" value="${pluginConfig.customMainBands[key].tune}" step="0.001" class="dark-input" style="width:65px; min-width:auto; padding:6px 10px;">
            <span style="color:var(--subtext); font-size:11px;">Low</span>
            <input type="number" id="start_${key}" value="${pluginConfig.customMainBands[key].start}" step="0.001" class="dark-input" style="width:65px; min-width:auto; padding:6px 10px;">
            <span style="color:var(--subtext); font-size:11px;">High</span>
            <input type="number" id="end_${key}" value="${pluginConfig.customMainBands[key].end}" step="0.001" class="dark-input" style="width:65px; min-width:auto; padding:6px 10px;">
        </div>
    </div>
`).join('')}

                <h3 style="margin-top:30px; color:#aaa; font-size:16px;">Shortwave Sub-Bands</h3>
                <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                    ${Object.keys(pluginConfig.customSwBands).map(key => `
                        <div class="setting-row" style="padding: 10px; margin-bottom:0;">
                            <div class="setting-info"><div class="setting-title" style="font-size:13px;">${key}</div></div>
                            <div style="display:flex; gap:5px; align-items:center;">
                                <span style="color:var(--subtext); font-size:11px;">Default Tune</span>
                                <input type="number" id="sw_tune_${key}" value="${pluginConfig.customSwBands[key].tune}" step="0.001" class="dark-input" style="width:65px; min-width:auto; padding:4px 8px; font-size:12px;">
                                <span style="color:var(--subtext); font-size:11px; margin-left:10px;">Range</span>
                                <input type="number" id="sw_start_${key}" value="${pluginConfig.customSwBands[key].start}" step="0.001" class="dark-input" style="width:65px; min-width:auto; padding:4px 8px; font-size:12px;">
                                <span style="color:var(--subtext); font-size:12px;">-</span>
                                <input type="number" id="sw_end_${key}" value="${pluginConfig.customSwBands[key].end}" step="0.001" class="dark-input" style="width:65px; min-width:auto; padding:4px 8px; font-size:12px;">
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Den nye Tab 4: Plugin Integration -->
            <div id="tab-plugins" class="tab-content">
                <h2>Plugin Integration</h2>

                <h3 style="margin-top:20px; color:#aaa; font-size:16px;">Highpoint Scanner Integration</h3>
                ${createToggleRow('ENABLE_AM_SCANNER', 'Enable Scanner plugin override', 'Intercepts the Highpoint scanner to respect AM/SW band limits and sub-bands.', pluginConfig.ENABLE_AM_SCANNER)}

                <div id="scanner-thresholds-block" style="display: ${pluginConfig.ENABLE_AM_SCANNER ? 'block' : 'none'}; border-left: 2px solid #3498db; padding-left: 15px; margin-bottom: 30px; margin-top: 15px;">
                    <p style="color:var(--subtext); margin-bottom: 15px; font-size: 13px;">Define the minimum signal strength (0-100) required to pause the scanner on a specific AM/SW band.</p>
                    <div class="threshold-grid">
                        ${['LW', 'MW', '160m', '120m', '90m', '75m', '60m', '49m', '41m', '31m', '25m', '22m', '19m', '16m', '15m', '13m', '11m'].map(t => `
                            <div class="threshold-card" style="padding: 10px;">
                                <span>${t} Band</span>
                                <input type="number" id="thr_${t}" value="${pluginConfig['thr_'+t]}" class="dark-input" style="width:60px;">
                            </div>
                        `).join('')}
                    </div>
                </div>

                <h3 style="margin-top:40px; color:#aaa; font-size:16px;">Highpoint Retro Design Elements Plugin</h3>
                ${createToggleRow('ENABLE_ANALOG_SCALE', 'Enable Analog Scale Integration', 'Injects a dynamic retro analog scale for all bands.', pluginConfig.ENABLE_ANALOG_SCALE)}

                <div id="scale-settings-block" style="display: ${pluginConfig.ENABLE_ANALOG_SCALE ? 'block' : 'none'}; border-left: 2px solid #3498db; padding-left: 15px; margin-bottom: 30px; margin-top: 15px;">
                    ${createToggleRow('ANALOG_SCALE_AUTOSTART', 'Autostart Scale', 'Automatically open the scale when tuning to a supported band.', pluginConfig.ANALOG_SCALE_AUTOSTART)}
                    ${createToggleRow('SHOW_TUNING_KNOB', 'Show Tuning Knob', 'Displays the dual rotary encoder for manual tuning.', pluginConfig.SHOW_TUNING_KNOB)}
                    ${createSliderRow('ANALOG_SCALE_BRIGHTNESS', 'Scale Brightness', 'Adjust the backlight brightness of the analog scale.', '0.2', '2.0', '0.05', pluginConfig.ANALOG_SCALE_BRIGHTNESS)}

                    <h4 style="margin-top:20px; color:#aaa; font-size:14px; margin-bottom:10px;">VU Meter Configuration</h4>
                    ${createToggleRow('ENABLE_VU_METER', 'Enable VU Meter', 'Displays a stereo VU meter next to the analog scale.', pluginConfig.ENABLE_VU_METER)}
                    ${createSelectRow('VU_METER_MODE', 'VU Meter Mode', 'RMS gives smooth realistic pumping. Peak shows raw loudness.',[{val: 'RMS', label: 'RMS (Smooth & Realistic)'}, {val: 'Peak', label: 'Peak (Raw Max Levels)'}], pluginConfig.VU_METER_MODE)}
                    ${createSliderRow('VU_METER_GAIN_FM', 'VU Meter Gain (FM)', 'Calibration multiplier for the VU meter on FM/OIRT.', '0.1', '5.0', '0.1', pluginConfig.VU_METER_GAIN_FM)}
                    ${createSliderRow('VU_METER_GAIN_AM', 'VU Meter Gain (AM/SW)', 'Calibration multiplier for the VU meter on AM/SW/MW/LW.', '0.1', '5.0', '0.1', pluginConfig.VU_METER_GAIN_AM)}
                    <h4 style="margin-top:20px; color:#aaa; font-size:14px; margin-bottom:10px;">Retro Magic Eye</h4>
                    ${createToggleRow('ENABLE_MAGIC_EYE', 'Enable Magic Eye Indicator', 'Converts the signal panel into a glowing vacuum tube indicator.', pluginConfig.ENABLE_MAGIC_EYE)}
                    <h4 style="margin-top:20px; color:#aaa; font-size:14px; margin-bottom:10px;">Scale Overlays & Data</h4>
                   ${createToggleRow('ENABLE_PS_SCALE', 'Show FM PS Stations', 'Display RDS PS names directly on the analog FM scale.', pluginConfig.ENABLE_PS_SCALE !== false)}
                    ${createToggleRow('ENABLE_SPECTRUM_OVERLAY', 'Show Spectrum Overlay', 'Project the SDR spectrum waterfall onto the analog dial glass.', pluginConfig.ENABLE_SPECTRUM_OVERLAY !== false)}
                    ${createToggleRow('ENABLE_SW_STATIONS_SCALE', 'Show SW Stations', 'Display active shortwave stations dynamically on the analog dial.<br><span style="color:#e74c3c; font-weight:bold; font-size:12px;">⚠️ Requires AM Station Info Plugin V1.4 or newer!</span>', pluginConfig.ENABLE_SW_STATIONS_SCALE !== false)}
                </div>
            </div>

        <div id="toast">Settings Saved Successfully!</div>

        <script>
            const navBtns = document.querySelectorAll('.nav-btn');
            const tabs = document.querySelectorAll('.tab-content');

            navBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    navBtns.forEach(b => b.classList.remove('active'));
                    tabs.forEach(t => t.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.target).classList.add('active');
                });
            });

            // Dynamisk visning av Scanner Thresholds
            document.getElementById('ENABLE_AM_SCANNER').addEventListener('change', function() {
                document.getElementById('scanner-thresholds-block').style.display = this.checked ? 'block' : 'none';
            });

            document.getElementById('ENABLE_ANALOG_SCALE').addEventListener('change', function() {
                document.getElementById('scale-settings-block').style.display = this.checked ? 'block' : 'none';
            });

            // Oppdater teksten vedsidenav sliderne i sanntid
            document.querySelectorAll('input[type="range"]').forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const display = document.getElementById(e.target.id + '_display');
                    if (display) display.innerText = e.target.value;
                });
            });

            document.getElementById('saveBtn').addEventListener('click', async () => {
                const bands = [];
                if(document.getElementById('band_FM').checked) bands.push('FM');
                if(document.getElementById('band_OIRT').checked) bands.push('OIRT');
                if(document.getElementById('band_SW').checked) bands.push('SW');
                if(document.getElementById('band_MW').checked) bands.push('MW');
                if(document.getElementById('band_LW').checked) bands.push('LW');

                const config = {
                    LAYOUT_STYLE: document.getElementById('LAYOUT_STYLE').value,
                    HIDE_ALL_BUTTONS: document.getElementById('HIDE_ALL_BUTTONS').checked,
                    SHOW_LOOP_BUTTON: document.getElementById('SHOW_LOOP_BUTTON').checked,
                    SHOW_BAND_RANGE: document.getElementById('SHOW_BAND_RANGE').checked,
                    HIDE_DECIMAL_FOR_HF: document.getElementById('HIDE_DECIMAL_FOR_HF').checked,
                    HIDE_DECIMAL_HF_THRESHOLD: parseFloat(document.getElementById('HIDE_DECIMAL_HF_THRESHOLD').value),
                    ENABLE_TUNE_STEP_FEATURE: document.getElementById('ENABLE_TUNE_STEP_FEATURE').checked,
                    TUNE_STEP_TIMEOUT_SECONDS: parseInt(document.getElementById('TUNE_STEP_TIMEOUT_SECONDS').value),
                    ENABLED_BANDS: bands,

                    TUNING_STANDARD: document.getElementById('TUNING_STANDARD').value,
                    ENABLE_SMART_KHZ_INPUT: document.getElementById('ENABLE_SMART_KHZ_INPUT').checked,
                    ENABLE_MW_STEP_TOGGLE: document.getElementById('ENABLE_MW_STEP_TOGGLE').checked,
                    ENABLE_FREQUENCY_MEMORY: document.getElementById('ENABLE_FREQUENCY_MEMORY').checked,
                    ENABLE_AM_BW: document.getElementById('ENABLE_AM_BW').checked,
                    FIRMWARE_TYPE: document.getElementById('FIRMWARE_TYPE').value,
                    ENABLE_DEFAULT_AM_BW: document.getElementById('ENABLE_DEFAULT_AM_BW').checked,
                    DEFAULT_AM_BW_VALUE: document.getElementById('DEFAULT_AM_BW_VALUE').value,

                    overrideServerTuningLimit: document.getElementById('overrideServerTuningLimit').checked,

                    ENABLE_AM_SCANNER: document.getElementById('ENABLE_AM_SCANNER').checked,
                    ENABLE_ANALOG_SCALE: document.getElementById('ENABLE_ANALOG_SCALE').checked,
                    ANALOG_SCALE_AUTOSTART: document.getElementById('ANALOG_SCALE_AUTOSTART').checked,
                    SHOW_TUNING_KNOB: document.getElementById('SHOW_TUNING_KNOB').checked,
                    ANALOG_SCALE_BRIGHTNESS: parseFloat(document.getElementById('ANALOG_SCALE_BRIGHTNESS').value),
                    ENABLE_VU_METER: document.getElementById('ENABLE_VU_METER').checked,
                    VU_METER_MODE: document.getElementById('VU_METER_MODE').value,
                    VU_METER_GAIN_FM: parseFloat(document.getElementById('VU_METER_GAIN_FM').value),
                    VU_METER_GAIN_AM: parseFloat(document.getElementById('VU_METER_GAIN_AM').value),
                    ENABLE_MAGIC_EYE: document.getElementById('ENABLE_MAGIC_EYE').checked,
                    ENABLE_PS_SCALE: document.getElementById('ENABLE_PS_SCALE').checked,
                    ENABLE_SPECTRUM_OVERLAY: document.getElementById('ENABLE_SPECTRUM_OVERLAY').checked,
                    ENABLE_SW_STATIONS_SCALE: document.getElementById('ENABLE_SW_STATIONS_SCALE').checked
                };

                const mainKeys = ['AM_SUPER', 'FM', 'OIRT', 'SW', 'MW', 'LW'];
                config.customMainBands = {};
                mainKeys.forEach(k => {
                    config.customMainBands[k] = {
                        name: document.getElementById('name_' + k).value,
                        tune: parseFloat(document.getElementById('tune_' + k).value),
                        start: parseFloat(document.getElementById('start_' + k).value),
                        end: parseFloat(document.getElementById('end_' + k).value)
                    };
                });

                const swKeys = ['160m', '120m', '90m', '75m', '60m', '49m', '41m', '31m', '25m', '22m', '19m', '16m', '15m', '13m', '11m'];
                config.customSwBands = {};
                swKeys.forEach(k => {
                    config.customSwBands[k] = {
                        tune: parseFloat(document.getElementById('sw_tune_' + k).value),
                        start: parseFloat(document.getElementById('sw_start_' + k).value),
                        end: parseFloat(document.getElementById('sw_end_' + k).value)
                    };
                });

                const thresholds = ['LW', 'MW', '160m', '120m', '90m', '75m', '60m', '49m', '41m', '31m', '25m', '22m', '19m', '16m', '15m', '13m', '11m'];
                thresholds.forEach(t => {
                    config['thr_' + t] = parseInt(document.getElementById('thr_' + t).value);
                });

                try {
                    const res = await fetch('/enhanced_tuning/api/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(config)
                    });

                    const toast = document.getElementById('toast');

                    if (res.ok) {
                        toast.innerText = 'Settings Saved Successfully!';
                        toast.style.backgroundColor = '#27ae60';
                        toast.classList.add('show');
                        setTimeout(() => toast.classList.remove('show'), 3000);
                    } else if (res.status === 401) {
                        alert('Session expired! You are no longer logged in as Admin. Please go back to the main page, log in again, and refresh this panel.');
                    } else {
                        throw new Error('Server returned ' + res.status);
                    }
                } catch(err) {
                    const toast = document.getElementById('toast');
                    toast.innerText = 'Error saving settings!';
                    toast.style.backgroundColor = '#e74c3c';
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 3000);
                }
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});