/*!
 * ************************************************
 * FM-DX Webserver WHEP Audio Plugin
 * ************************************************
 * Created by techkrzysiek
 * ************************************************
 */

(() => {
    const WHEP_CONFIG_PATH = '/webrtc-audio.conf';
    const WHEP_FLAGS_PATH = '/webrtc-audio-flags.json';
    const LAST_BITRATE_COOKIE_NAME = 'webrtcAudioLastBitrate';
    const LAST_SOURCE_COOKIE_NAME = 'webrtcAudioSource';
    const LEGACY_SOURCE_VALUE = '3las';
    const SELECT_ID = 'webrtc-audio-mode-select';
    const SELECT_LOADING_VALUE = 'webrtc:loading';
    const MANAGED_PLAYBUTTON_CLASS = 'fmdx-webrtc-playbutton';
    const LEGACY_PROXY_BUTTON_ID = 'fmdx-webrtc-legacy-playbutton';
    const SELECT_TOOLTIP_HTML = '<strong>WebRTC</strong> - very low latency audio<br>If audio starts stuttering,<br>switch to <strong>3LAS (TCP)</strong>.';
    const DEBUG_WEBRTC_AUDIO = false;
    const RECONNECT_DELAY = 3000;
    const FIRST_DISCONNECT_RECONNECT_DELAY = 500;
    const MAX_RECONNECT_ATTEMPTS = 50;
    const UI_ATTACH_INITIAL_DELAY = 250;
    const ONDEMAND_STARTUP_404_GRACE_ATTEMPTS = 5;
    const ONDEMAND_STARTUP_RECONNECT_MS_FAST = 500;
    const ONDEMAND_STARTUP_RECONNECT_MS_SLOW = 1000;
    const ONDEMAND_STARTUP_FAST_RETRY_COUNT = 2;

    const webrtcCss = `
    .fmdx-webrtc-playbutton-host:not(#mobileTray) {
        width: 92px !important;
        overflow: visible;
    }
    .fmdx-webrtc-button-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 100%;
        width: 100%;
    }
    .fmdx-webrtc-playbutton-host .${MANAGED_PLAYBUTTON_CLASS} {
        min-height: 64px;
        height: 64px;
    }
    #mobileTray .fmdx-webrtc-button-stack {
        position: absolute;
        top: -50%;
        left: 50%;
        margin-left: -32px;
        width: 64px !important;
        height: 64px;
        display: block;
    }
    #mobileTray .${MANAGED_PLAYBUTTON_CLASS} {
        width: 64px !important;
        height: 64px !important;
        display: block !important;
        box-sizing: border-box !important;
        position: static !important;
        transform: none !important;
    }
    #mobileTray .fmdx-webrtc-mode-select {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        width: max-content;
        height: 24px;
        padding: 1px 4px;
        font-size: 11px;
    }
    .${MANAGED_PLAYBUTTON_CLASS} i {
        display: inline-block;
        width: 1em;
        text-align: center;
    }
    #${LEGACY_PROXY_BUTTON_ID} {
        position: absolute !important;
        left: -9999px !important;
        top: -9999px !important;
        width: 1px !important;
        height: 1px !important;
        opacity: 0 !important;
        pointer-events: none !important;
    }
    .fmdx-webrtc-mode-select {
        width: 100%;
        max-width: 86px;
        height: 20px;
        padding: 0 2px;
        font-size: 10px;
        line-height: 1;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.45);
        color: #fff;
        text-align: center;
        text-align-last: center;
    }
    .fmdx-webrtc-mode-select:hover,
    .fmdx-webrtc-mode-select:focus,
    .fmdx-webrtc-mode-select:active {
        color: #fff !important;
        background: rgba(0, 0, 0, 0.45) !important;
    }
    .fmdx-webrtc-mode-select option {
        color: #fff;
        background: #000;
    }
    .fmdx-webrtc-mode-select:focus {
        outline: 1px solid var(--color-main-bright);
    }
    .${MANAGED_PLAYBUTTON_CLASS}.rtc-connecting {
        animation: rtc-breathe 1.8s ease-in-out infinite;
        transform-origin: center;
        will-change: transform, box-shadow, background-color, border-color, filter;
        background-color: rgba(255, 165, 0, 0.14) !important;
        border-color: rgba(255, 165, 0, 0.45) !important;
    }
    .${MANAGED_PLAYBUTTON_CLASS}.rtc-connecting i {
        color: orange;
        animation: rtc-pulse 1.1s ease-in-out infinite;
        transform-origin: center;
    }
    @keyframes rtc-breathe {
        0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 rgba(255, 165, 0, 0), 0 0 0 rgba(255, 165, 0, 0);
            background-color: rgba(255, 165, 0, 0.10);
            border-color: rgba(255, 165, 0, 0.28);
            filter: brightness(1);
        }
        50% {
            transform: scale(0.93);
            box-shadow: 0 0 18px rgba(255, 165, 0, 0.32), 0 0 30px rgba(255, 165, 0, 0.20);
            background-color: rgba(255, 165, 0, 0.24);
            border-color: rgba(255, 165, 0, 0.70);
            filter: brightness(1.12);
        }
    }
    @keyframes rtc-pulse {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.55;
            transform: scale(0.82);
        }
    }`;

    let disable3las = false;
    let disableMobileSelect = true;

    let peerConnection = null;
    let audioElement = null;
    let isActive = false;
    let isConnecting = false;
    let shouldReconnect = false;
    let reconnectAttempts = 0;
    let reconnectTimeout = null;
    let profiles = [];
    let currentBitrateIndex = 0;
    let currentBitrate = null;
    let whepSessionUrl = null;
    let onDemandStartup404Attempts = 0;
    let isPeerConnectionReady = false;
    let hasAudioPlaybackStarted = false;
    let audioPlaybackProgressTimeout = null;
    let currentDebugSessionId = 0;
    let currentDebugSessionStartedAt = 0;

    function getAudioElementDebugState(element = audioElement) {
        if (!element) {
            return {
                hasElement: false
            };
        }

        return {
            hasElement: true,
            paused: element.paused,
            muted: element.muted,
            volume: element.volume,
            currentTime: Number(element.currentTime || 0).toFixed(3),
            readyState: element.readyState,
            networkState: element.networkState
        };
    }

    function logWebRTCDebug(message, details = undefined) {
        if (!DEBUG_WEBRTC_AUDIO) {
            return;
        }

        const elapsedMs = currentDebugSessionStartedAt
            ? Math.round(performance.now() - currentDebugSessionStartedAt)
            : 0;
        const prefix = `[WHEP][debug s${currentDebugSessionId} +${elapsedMs}ms] ${message}`;

        if (typeof details === 'undefined') {
            console.log(prefix);
            return;
        }

        console.log(prefix, details);
    }

    function clearAudioPlaybackProgressCheck() {
        if (audioPlaybackProgressTimeout) {
            clearTimeout(audioPlaybackProgressTimeout);
            audioPlaybackProgressTimeout = null;
        }
    }

    function getWhepConfigUrl() {
        return new URL(WHEP_CONFIG_PATH.replace(/^\//, ''), window.location.origin + '/').toString();
    }

    function getWhepFlagsUrl() {
        return new URL(WHEP_FLAGS_PATH.replace(/^\//, ''), window.location.origin + '/').toString();
    }

    async function fetchFlags() {
        try {
            const response = await fetch(getWhepFlagsUrl(), { method: 'GET', cache: 'no-store' });
            if (!response.ok) {
                return;
            }
            const flags = await response.json();
            disable3las = Boolean(flags.disable3las);
        } catch (error) {
            console.warn('[WHEP] Failed to fetch flags:', error);
        }
    }

    function getCurrentProfile() {
        return profiles[currentBitrateIndex] || null;
    }

    function getCookieDomainAttribute() {
        const hostname = String(window.location.hostname || '').toLowerCase();
        if (hostname === 'fmdx.pro' || hostname.endsWith('.fmdx.pro')) {
            return '; domain=.fmdx.pro';
        }
        return '';
    }

    function setPersistentCookie(name, value, days = 365) {
        const expires = new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toUTCString();
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${getCookieDomainAttribute()}${secure}`;
    }

    function getCookie(name) {
        return document.cookie.split('; ').reduce((result, entry) => {
            const separatorIndex = entry.indexOf('=');
            if (separatorIndex === -1) {
                return result;
            }

            const cookieName = entry.slice(0, separatorIndex);
            return cookieName === name ? decodeURIComponent(entry.slice(separatorIndex + 1)) : result;
        }, '');
    }

    function getStoredBitrate() {
        const storedBitrate = Number(getCookie(LAST_BITRATE_COOKIE_NAME));
        return Number.isFinite(storedBitrate) && storedBitrate > 0 ? storedBitrate : null;
    }

    function getStoredSource() {
        return getCookie(LAST_SOURCE_COOKIE_NAME);
    }

    function persistSelectedBitrate() {
        if (Number.isFinite(currentBitrate) && currentBitrate > 0) {
            setPersistentCookie(LAST_BITRATE_COOKIE_NAME, currentBitrate);
        }
    }

    function persistSelectedSource(value) {
        if (value) {
            setPersistentCookie(LAST_SOURCE_COOKIE_NAME, value);
        }
    }

    function parseWhepProfiles(rawConfig) {
        return String(rawConfig || '')
            .split(';')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
                const separatorIndex = entry.indexOf(':');
                if (separatorIndex <= 0) {
                    return null;
                }

                const bitrate = Number(entry.slice(0, separatorIndex).trim());
                const url = entry.slice(separatorIndex + 1).trim();
                if (!Number.isFinite(bitrate) || bitrate <= 0 || !url) {
                    return null;
                }

                try {
                    return {
                        bitrate,
                        url: new URL(url).toString()
                    };
                } catch (error) {
                    console.warn('[WHEP] Ignoring invalid URL in config:', entry, error);
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => a.bitrate - b.bitrate);
    }

    function formatBitrate(bitrate) {
        return Math.round(bitrate / 1000) + 'k';
    }

    function formatWebRtcOptionLabel(bitrate) {
        return `WebRTC ${formatBitrate(bitrate)}`;
    }

    function getLegacyOptionLabel() {
        return '3LAS (TCP)';
    }

    function getSelectedBitrateLabel() {
        return currentBitrate ? formatWebRtcOptionLabel(currentBitrate) : 'WebRTC';
    }

    function parseSelectedBitrate(value) {
        if (typeof value !== 'string' || !value.startsWith('webrtc:')) {
            return null;
        }

        const bitrate = Number(value.slice('webrtc:'.length));
        return Number.isFinite(bitrate) && bitrate > 0 ? bitrate : null;
    }

    function updateVolume() {
        if (audioElement) {
            const volume = parseFloat($('#volumeSlider').val());
            audioElement.volume = Number.isFinite(volume) ? volume : 1;

            // Kuba's patches, not techkrzysiek code
            if(!Number.isFinite(volume)) logWebRTCDebug("Volume is not finite.");
        } else logWebRTCDebug("audioElement not initialized.")
    }

    function initVolumeControl() {
        const volumeSlider = document.getElementById('volumeSlider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', updateVolume);
        }
        updateVolume();
    }

    function ensureAudioElement() {
        if (audioElement) {
            return audioElement;
        }

        audioElement = new Audio();
        audioElement.autoplay = true;
        audioElement.preload = 'none';
        audioElement.style.display = 'none';
        audioElement.setAttribute('data-webrtc-audio', 'true');
        ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing', 'timeupdate', 'pause', 'waiting', 'stalled', 'suspend', 'ended', 'error']
            .forEach((eventName) => {
                audioElement.addEventListener(eventName, () => {
                    logWebRTCDebug(`audio event: ${eventName}`, getAudioElementDebugState(audioElement));
                });
            });
        audioElement.addEventListener('playing', () => {
            scheduleAudioPlaybackProgressCheck('playing');
        });
        audioElement.addEventListener('timeupdate', () => {
            maybeMarkAudioPlaybackStarted('timeupdate');
        });
        document.body.appendChild(audioElement);
        updateVolume();
        return audioElement;
    }

    function maybeMarkAudioPlaybackStarted(source) {
        if (!audioElement || hasAudioPlaybackStarted) {
            return;
        }

        const currentTime = Number(audioElement.currentTime || 0);
        if (currentTime <= 0.05) {
            logWebRTCDebug(`audio progress not started yet (${source})`, {
                currentTime: currentTime.toFixed(3),
                audio: getAudioElementDebugState()
            });
            return;
        }

        logWebRTCDebug(`markAudioPlaybackStarted() from ${source}`, getAudioElementDebugState());
        hasAudioPlaybackStarted = true;
        clearAudioPlaybackProgressCheck();
        maybeFinalizeWebRTCConnected();
    }

    function scheduleAudioPlaybackProgressCheck(source, remainingAttempts = 40) {
        clearAudioPlaybackProgressCheck();
        const checkProgress = () => {
            if (!audioElement || hasAudioPlaybackStarted || !isConnecting) {
                audioPlaybackProgressTimeout = null;
                return;
            }

            maybeMarkAudioPlaybackStarted(`timer:${source}`);
            if (hasAudioPlaybackStarted || remainingAttempts <= 0) {
                audioPlaybackProgressTimeout = null;
                return;
            }

            remainingAttempts--;
            audioPlaybackProgressTimeout = setTimeout(checkProgress, 100);
        };

        audioPlaybackProgressTimeout = setTimeout(checkProgress, 100);
    }

    function maybeFinalizeWebRTCConnected() {
        logWebRTCDebug('maybeFinalizeWebRTCConnected()', {
            isPeerConnectionReady,
            hasAudioPlaybackStarted,
            isActive,
            isConnecting,
            audio: getAudioElementDebugState()
        });
        if (!peerConnection || !isPeerConnectionReady || !hasAudioPlaybackStarted || isActive) {
            return;
        }

        isConnecting = false;
        isActive = true;
        reconnectAttempts = 0;
        onDemandStartup404Attempts = 0;
        updateButtonState('connected');
        logWebRTCDebug('UI switched to connected', {
            profile: getSelectedBitrateLabel(),
            audio: getAudioElementDebugState()
        });
        sendToast('success', 'WebRTC Audio', `Connected (${getSelectedBitrateLabel()})`, false, false);
    }

    function getManagedPlayButtons() {
        return $(`.${MANAGED_PLAYBUTTON_CLASS}`);
    }

    function getLegacyProxyButton() {
        return $(`#${LEGACY_PROXY_BUTTON_ID}`);
    }

    function getDesktopPlayButton() {
        const $managedButton = getManagedPlayButtons()
            .filter((_, element) => $(element).closest('.hide-phone').length > 0)
            .first();
        if ($managedButton.length > 0) {
            return $managedButton;
        }

        return $('.playbutton')
            .filter((_, element) => $(element).closest('.hide-phone').length > 0)
            .first();
    }

    function getMobilePlayButton() {
        const $managedButton = getManagedPlayButtons()
            .filter((_, element) => $(element).closest('#mobileTray').length > 0)
            .first();
        if ($managedButton.length > 0) {
            return $managedButton;
        }

        return $('#mobileTray .playbutton').first();
    }

    function ensureManagedDesktopPlayButton() {
        let $desktopButton = getDesktopPlayButton();
        if ($desktopButton.length === 0) {
            return $desktopButton;
        }

        if ($desktopButton.hasClass(MANAGED_PLAYBUTTON_CLASS)) {
            return $desktopButton;
        }

        const $proxyButton = $desktopButton;
        const $managedButton = $proxyButton.clone(false);
        const $placeholder = $('<span data-fmdx-webrtc-playbutton-placeholder="true" style="display:none;"></span>');
        $managedButton.removeClass('playbutton').addClass(MANAGED_PLAYBUTTON_CLASS);
        $managedButton.off();
        $proxyButton.after($placeholder);
        $proxyButton
            .attr('id', LEGACY_PROXY_BUTTON_ID)
            .attr('aria-hidden', 'true')
            .attr('tabindex', '-1')
            .appendTo(document.body);
        $placeholder.replaceWith($managedButton);
        return $managedButton;
    }

    function ensureManagedMobilePlayButton() {
        let $mobileButton = getMobilePlayButton();
        if ($mobileButton.length === 0) {
            return $mobileButton;
        }

        if ($mobileButton.hasClass(MANAGED_PLAYBUTTON_CLASS)) {
            return $mobileButton;
        }

        $mobileButton.removeClass('playbutton').addClass(MANAGED_PLAYBUTTON_CLASS);
        $mobileButton.off();
        return $mobileButton;
    }

    function getLegacyProxyState() {
        const $proxyButton = getLegacyProxyButton();
        if ($proxyButton.length === 0) {
            return isLegacyPlaybackActive() ? 'connected' : 'disconnected';
        }

        const $icon = $proxyButton.find('i');
        if ($icon.hasClass('fa-stop')) {
            return 'connected';
        }
        return 'disconnected';
    }

    function syncManagedButtonWithLegacyState() {
        const legacyState = getLegacyProxyState();
        const $buttons = getManagedPlayButtons();
        $buttons.removeClass('rtc-active rtc-connecting');
        if (legacyState === 'connected') {
            $buttons.addClass('rtc-active');
        }
        updatePlayButtonIcon(legacyState === 'connected' ? 'connected' : 'disconnected');
        updatePlayButtonTitle(legacyState === 'connected' ? 'connected' : 'disconnected');
    }

    function updatePlayButtonIcon(state) {
        const $icons = getManagedPlayButtons().find('i');
        $icons.removeClass('fa-play fa-stop fa-spinner fa-spin');

        switch (state) {
            case 'connecting':
                $icons.addClass('fa-spinner fa-spin');
                break;
            case 'connected':
                $icons.addClass('fa-stop');
                break;
            default:
                $icons.addClass('fa-play');
                break;
        }
    }

    function updatePlayButtonTitle(state) {
        const selectionLabel = getSelectedSourceLabel();
        const title = state === 'connected' || state === 'connecting'
            ? `Stop ${selectionLabel}`
            : `Play ${selectionLabel}`;
        getManagedPlayButtons()
            .attr('title', title)
            .attr('aria-label', title);
    }

    function updateButtonState(state) {
        const $buttons = getManagedPlayButtons();
        $buttons.removeClass('rtc-active rtc-connecting');

        switch (state) {
            case 'connecting':
                $buttons.addClass('rtc-connecting');
                updatePlayButtonIcon('connecting');
                break;
            case 'connected':
                $buttons.addClass('rtc-active');
                updatePlayButtonIcon('connected');
                break;
            default:
                updatePlayButtonIcon('disconnected');
                break;
        }

        updatePlayButtonTitle(state);
    }

    function normalizeStoredSourceValue(value) {
        if (value === LEGACY_SOURCE_VALUE) {
            return value;
        }

        const storedBitrate = parseSelectedBitrate(value);
        if (storedBitrate) {
            return `webrtc:${storedBitrate}`;
        }

        const legacyBitrate = getStoredBitrate();
        return legacyBitrate ? `webrtc:${legacyBitrate}` : '';
    }

    function getDefaultSourceValue() {
        const storedValue = normalizeStoredSourceValue(getStoredSource());
        if (storedValue === LEGACY_SOURCE_VALUE && !disable3las) {
            return LEGACY_SOURCE_VALUE;
        }

        const storedBitrate = parseSelectedBitrate(storedValue);
        if (profiles.length === 0) {
            return storedValue || SELECT_LOADING_VALUE;
        }

        const matchingProfile = Number.isFinite(storedBitrate)
            ? profiles.find((profile) => profile.bitrate === storedBitrate)
            : null;
        const fallbackProfile = matchingProfile || profiles[profiles.length - 1];
        return `webrtc:${fallbackProfile.bitrate}`;
    }

    function applySelectedSourceValue(value, { persist = true, syncSelect = true } = {}) {
        const $selects = $(`.fmdx-webrtc-mode-select`);
        const buttonState = getActivePlaybackBackend() ? 'connected' : 'disconnected';

        if (value === LEGACY_SOURCE_VALUE && !disable3las) {
            if (syncSelect) {
                $selects.val(LEGACY_SOURCE_VALUE);
            }
            if (persist) {
                persistSelectedSource(LEGACY_SOURCE_VALUE);
            }
            updatePlayButtonTitle(buttonState);
            return LEGACY_SOURCE_VALUE;
        }

        if (profiles.length === 0) {
            if (syncSelect) {
                $selects.val(SELECT_LOADING_VALUE);
            }
            updatePlayButtonTitle(buttonState);
            return SELECT_LOADING_VALUE;
        }

        const requestedBitrate = parseSelectedBitrate(value);
        const selectedIndex = Number.isFinite(requestedBitrate)
            ? profiles.findIndex((profile) => profile.bitrate === requestedBitrate)
            : -1;
        currentBitrateIndex = selectedIndex >= 0 ? selectedIndex : profiles.length - 1;
        currentBitrate = profiles[currentBitrateIndex].bitrate;
        persistSelectedBitrate();

        const appliedValue = `webrtc:${currentBitrate}`;
        if (syncSelect) {
            $selects.val(appliedValue);
        }
        if (persist) {
            persistSelectedSource(appliedValue);
        }

        updatePlayButtonTitle(buttonState);
        return appliedValue;
    }

    function getSelectedSourceValue() {
        const $selects = $(`.fmdx-webrtc-mode-select`);
        for (let i = 0; i < $selects.length; i++) {
            const value = $selects[i].value;
            if (value && value !== SELECT_LOADING_VALUE) {
                return value;
            }
        }
        return getDefaultSourceValue();
    }

    function getSelectedSourceLabel() {
        const selectedValue = getSelectedSourceValue();
        if (selectedValue === LEGACY_SOURCE_VALUE) {
            return getLegacyOptionLabel();
        }

        const selectedBitrate = parseSelectedBitrate(selectedValue) ?? currentBitrate;
        return selectedBitrate ? formatWebRtcOptionLabel(selectedBitrate) : 'WebRTC';
    }

    function isLegacyPlaybackActive() {
        return typeof Stream !== 'undefined' && Boolean(Stream);
    }

    function getActivePlaybackBackend() {
        if (isConnecting || isActive || shouldReconnect) {
            return 'webrtc';
        }
        if (isLegacyPlaybackActive()) {
            return LEGACY_SOURCE_VALUE;
        }
        return null;
    }

    function stopLegacyPlayback() {
        if (typeof OnPlayButtonClick === 'function' && isLegacyPlaybackActive()) {
            OnPlayButtonClick();
            setTimeout(() => {
                syncManagedButtonWithLegacyState();
            }, 0);
        }
    }

    function startLegacyPlayback() {
        if (typeof OnPlayButtonClick === 'function' && !isLegacyPlaybackActive()) {
            OnPlayButtonClick();
            setTimeout(() => {
                syncManagedButtonWithLegacyState();
            }, 0);
        }
    }

    function buildOptionsHtml() {
        const options = profiles
            .slice()
            .sort((a, b) => b.bitrate - a.bitrate)
            .map((profile) => ({
                value: `webrtc:${profile.bitrate}`,
                label: formatWebRtcOptionLabel(profile.bitrate)
            }));

        if (options.length === 0) {
            options.push({
                value: SELECT_LOADING_VALUE,
                label: 'WebRTC...',
                disabled: true
            });
        }

        if (!disable3las) {
            options.push({
                value: LEGACY_SOURCE_VALUE,
                label: getLegacyOptionLabel()
            });
        }

        return options.map((option) => `
            <option value="${option.value}"${option.disabled ? ' disabled' : ''}>
                ${option.label}
            </option>
        `).join('');
    }

    function attachSelectToButton($button, selectId) {
        if ($button.length === 0) {
            return null;
        }

        const $host = $button.closest('.panel-10').length > 0
            ? $button.closest('.panel-10')
            : $button.parent();
        $host.addClass('fmdx-webrtc-playbutton-host');

        if (!$button.parent().hasClass('fmdx-webrtc-button-stack')) {
            $button.wrap('<div class="fmdx-webrtc-button-stack"></div>');
        }

        const $stack = $button.parent();
        let $select = $stack.find(`#${selectId}`);
        if ($select.length === 0) {
            $select = $('<select>', {
                id: selectId,
                class: 'fmdx-webrtc-mode-select tooltip',
                'aria-label': 'Audio stream backend',
                'data-tooltip': SELECT_TOOLTIP_HTML
            });
            $select.on('click mousedown', (event) => event.stopPropagation());
            $select.on('change', () => {
                syncAllSelects($select);
                void handleSourceSelectionChange();
            });
            $stack.append($select);
        }

        return $select;
    }

    function syncAllSelects($source) {
        const value = $source.val();
        $(`.fmdx-webrtc-mode-select`).not($source).val(value);
    }

    function renderModeSelect() {
        const $desktopButton = ensureManagedDesktopPlayButton();

        let $mobileButton = $();
        if (!disableMobileSelect) {
            $mobileButton = ensureManagedMobilePlayButton();
        }

        if ($desktopButton.length === 0 && $mobileButton.length === 0) {
            return false;
        }

        const optionsHtml = buildOptionsHtml();

        const $desktopSelect = attachSelectToButton($desktopButton, SELECT_ID);
        if ($desktopSelect) {
            $desktopSelect.html(optionsHtml);
        }

        if (!disableMobileSelect) {
            const $mobileSelect = attachSelectToButton($mobileButton, SELECT_ID + '-mobile');
            if ($mobileSelect) {
                $mobileSelect.html(optionsHtml);
            }
        }

        applySelectedSourceValue(getDefaultSourceValue(), { persist: false, syncSelect: true });
        return true;
    }

    function bindPlayButtons() {
        const $buttons = getManagedPlayButtons();
        if ($buttons.length === 0) {
            return false;
        }

        $buttons
            .off('click')
            .on('click.fmdxProWebrtc', (event) => {
                event.stopImmediatePropagation();
                event.stopPropagation();
                void handlePlayButtonClick(event);
            });
        return true;
    }

    function syncIntegratedPlaybackUi() {
        renderModeSelect();
        bindPlayButtons();

        const activeBackend = getActivePlaybackBackend();
        if (activeBackend === 'webrtc') {
            updateButtonState(isConnecting ? 'connecting' : 'connected');
        } else if (!activeBackend) {
            updateButtonState('disconnected');
        } else {
            syncManagedButtonWithLegacyState();
        }
    }

    async function fetchAvailableBitrates({ preserveSelection = true } = {}) {
        const previouslySelectedBitrate = currentBitrate ?? getStoredBitrate();
        const response = await fetch(getWhepConfigUrl(), {
            method: 'GET',
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error(`WHEP config error: ${response.status} ${response.statusText}`);
        }

        const rawConfig = await response.text();
        profiles = parseWhepProfiles(rawConfig);
        if (profiles.length === 0) {
            throw new Error('No WHEP bitrate profiles configured');
        }

        const preservedIndex = preserveSelection && Number.isFinite(previouslySelectedBitrate)
            ? profiles.findIndex((profile) => profile.bitrate === previouslySelectedBitrate)
            : -1;
        currentBitrateIndex = preservedIndex >= 0 ? preservedIndex : profiles.length - 1;
        currentBitrate = profiles[currentBitrateIndex].bitrate;
        persistSelectedBitrate();
        console.log('[WHEP] Available bitrates:', profiles.map((profile) => formatBitrate(profile.bitrate)).join(', '));
        renderModeSelect();
    }

    function modifyOfferSdp(sdp) {
        return sdp
            .replace(/useinbandfec=1/g, 'useinbandfec=1;stereo=1;sprop-stereo=1')
            .replace(/minptime=10/g, 'minptime=10;ptime=10;maxptime=10');
    }

    async function waitForIceGathering(pc, timeoutMs) {
        await new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
                return;
            }

            const handler = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', handler);
                    resolve();
                }
            };

            pc.addEventListener('icegatheringstatechange', handler);
            setTimeout(() => {
                pc.removeEventListener('icegatheringstatechange', handler);
                resolve();
            }, timeoutMs);
        });
    }

    async function deleteWhepSession() {
        if (!whepSessionUrl) {
            return;
        }

        const sessionUrl = whepSessionUrl;
        whepSessionUrl = null;

        try {
            await fetch(sessionUrl, {
                method: 'DELETE',
                keepalive: true
            });
        } catch (error) {
            console.warn('[WHEP] Failed to delete session:', error);
        }
    }

    async function cleanupConnection(deleteSession = true) {
        logWebRTCDebug('cleanupConnection()', {
            deleteSession,
            audio: getAudioElementDebugState()
        });
        clearAudioPlaybackProgressCheck();
        isConnecting = false;
        isPeerConnectionReady = false;
        hasAudioPlaybackStarted = false;

        if (peerConnection) {
            peerConnection.ontrack = null;
            peerConnection.onconnectionstatechange = null;
            try {
                peerConnection.close();
            } catch (error) {
                console.warn('[WHEP] Error closing peer connection:', error);
            }
            peerConnection = null;
        }

        if (audioElement) {
            audioElement.pause();
            audioElement.srcObject = null;
            if (audioElement.parentNode) {
                audioElement.parentNode.removeChild(audioElement);
            }
            audioElement = null;
        }

        if (deleteSession) {
            await deleteWhepSession();
        }
    }

    function scheduleReconnect({ countAttempt = true, delayMs = RECONNECT_DELAY } = {}) {
        if (!shouldReconnect) {
            return;
        }

        if (countAttempt && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            sendToast('error', 'WebRTC Audio', 'Reconnect limit reached', false, false);
            void stopWebRTC();
            return;
        }

        if (countAttempt) {
            reconnectAttempts++;
        }

        const effectiveDelayMs = countAttempt && reconnectAttempts === 1 && delayMs === RECONNECT_DELAY
            ? FIRST_DISCONNECT_RECONNECT_DELAY
            : delayMs;

        updateButtonState('connecting');
        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            if (shouldReconnect) {
                void startWebRTC({ refreshProfiles: true });
            }
        }, effectiveDelayMs);
    }

    function createResponseError(response) {
        const error = new Error(`Server error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.statusText = response.statusText;
        return error;
    }

    function isOnDemandStartupNotReady(error) {
        return Boolean(
            error &&
            error.status === 404 &&
            shouldReconnect &&
            onDemandStartup404Attempts < ONDEMAND_STARTUP_404_GRACE_ATTEMPTS
        );
    }

    async function handleDisconnect() {
        const wasRequested = shouldReconnect;
        isActive = false;
        await cleanupConnection();

        if (wasRequested) {
            scheduleReconnect();
        } else {
            updateButtonState('disconnected');
        }
    }

    async function startWebRTC({ refreshProfiles = false } = {}) {
        if (isConnecting) {
            logWebRTCDebug('startWebRTC() ignored because isConnecting=true');
            return;
        }

        if (profiles.length === 0 || refreshProfiles) {
            try {
                await fetchAvailableBitrates({ preserveSelection: true });
            } catch (error) {
                if (refreshProfiles && profiles.length > 0) {
                    console.warn('[WHEP] Failed to refresh bitrate profiles, using cached config:', error);
                } else {
                    throw error;
                }
            }
        }

        const currentProfile = getCurrentProfile();
        if (!currentProfile) {
            throw new Error('Selected WHEP profile is unavailable');
        }

        currentDebugSessionId += 1;
        currentDebugSessionStartedAt = performance.now();
        isPeerConnectionReady = false;
        hasAudioPlaybackStarted = false;
        isConnecting = true;
        shouldReconnect = true;
        logWebRTCDebug('startWebRTC()', {
            refreshProfiles,
            profile: currentProfile,
            selectedSource: getSelectedSourceValue()
        });
        updateButtonState('connecting');

        try {
            const pc = new RTCPeerConnection();
            peerConnection = pc;

            pc.ontrack = (event) => {
                logWebRTCDebug('pc.ontrack', {
                    streams: event.streams.length,
                    trackState: event.track ? event.track.readyState : 'unknown'
                });
                const element = ensureAudioElement();
                element.srcObject = event.streams[0];
                logWebRTCDebug('audio srcObject assigned', getAudioElementDebugState(element));
                element.play()
                    .then(() => {
                        scheduleAudioPlaybackProgressCheck('play-resolved');
                        logWebRTCDebug('audio.play() resolved', getAudioElementDebugState(element));
                    })
                    .catch((error) => {
                        logWebRTCDebug('audio.play() rejected', {
                            error: error.message,
                            audio: getAudioElementDebugState(element)
                        });
                        console.warn('[WHEP] Autoplay blocked:', error);
                        sendToast('warning', 'WebRTC Audio', 'Click anywhere to start audio playback', false, false);
                        document.addEventListener('click', () => {
                            if (audioElement) {
                                logWebRTCDebug('retrying audio.play() after user click', getAudioElementDebugState(audioElement));
                                audioElement.play()
                                    .then(() => {
                                        scheduleAudioPlaybackProgressCheck('play-retry-resolved');
                                        logWebRTCDebug('audio.play() retry resolved', getAudioElementDebugState(audioElement));
                                    })
                                    .catch((playbackError) => {
                                        logWebRTCDebug('audio.play() retry rejected', {
                                            error: playbackError.message,
                                            audio: getAudioElementDebugState(audioElement)
                                        });
                                        console.warn('[WHEP] Audio playback retry failed:', playbackError);
                                    });
                            }
                        }, { once: true });
                    });
            };

            pc.onconnectionstatechange = () => {
                if (pc !== peerConnection) {
                    return;
                }

                logWebRTCDebug('pc.connectionstatechange', {
                    connectionState: pc.connectionState,
                    iceConnectionState: pc.iceConnectionState,
                    signalingState: pc.signalingState
                });
                if (pc.connectionState === 'connected') {
                    isPeerConnectionReady = true;
                    maybeFinalizeWebRTCConnected();
                } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                    void handleDisconnect();
                }
            };

            pc.addTransceiver('audio', { direction: 'recvonly' });

            const offer = await pc.createOffer();
            offer.sdp = modifyOfferSdp(offer.sdp);
            await pc.setLocalDescription(offer);
            await waitForIceGathering(pc, 2000);
            logWebRTCDebug('local description ready', {
                hasLocalDescription: Boolean(pc.localDescription),
                iceGatheringState: pc.iceGatheringState
            });

            if (pc !== peerConnection) {
                logWebRTCDebug('startWebRTC() aborted because peerConnection changed');
                return;
            }

            logWebRTCDebug('sending WHEP offer', {
                label: getSelectedBitrateLabel(),
                url: currentProfile.url
            });
            const response = await fetch(currentProfile.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/sdp',
                    'Accept': 'application/sdp'
                },
                body: pc.localDescription.sdp
            });

            if (!response.ok) {
                throw createResponseError(response);
            }

            const locationHeader = response.headers.get('Location');
            whepSessionUrl = locationHeader ? new URL(locationHeader, currentProfile.url).toString() : null;
            const answerSdp = await response.text();
            logWebRTCDebug('WHEP answer received', {
                status: response.status,
                hasSessionUrl: Boolean(whepSessionUrl),
                answerLength: answerSdp.length
            });
            await pc.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });
            logWebRTCDebug('remote description set');
        } catch (error) {
            if (isOnDemandStartupNotReady(error)) {
                onDemandStartup404Attempts++;
                const onDemandDelayMs = onDemandStartup404Attempts <= ONDEMAND_STARTUP_FAST_RETRY_COUNT
                    ? ONDEMAND_STARTUP_RECONNECT_MS_FAST
                    : ONDEMAND_STARTUP_RECONNECT_MS_SLOW;
                logWebRTCDebug('on-demand not ready yet', {
                    attempts: onDemandStartup404Attempts,
                    nextDelayMs: onDemandDelayMs
                });
                console.info('[WHEP] WHEP endpoint not ready yet, waiting for on-demand startup...');
                isActive = false;
                await cleanupConnection(false);
                scheduleReconnect({ delayMs: onDemandDelayMs });
                return;
            }

            onDemandStartup404Attempts = 0;
            logWebRTCDebug('startWebRTC() failed', {
                error: error.message,
                status: error.status
            });
            console.error('[WHEP] Error:', error);
            sendToast('error', 'WebRTC Audio', error.message || 'Connection failed', false, false);
            await handleDisconnect();
        }
    }

    async function stopWebRTC() {
        shouldReconnect = false;
        isActive = false;
        isConnecting = false;
        onDemandStartup404Attempts = 0;
        updateButtonState('disconnected');

        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        await cleanupConnection(false);
        void deleteWhepSession();
        updateButtonState('disconnected');
        console.log('[WHEP] Disconnected');
    }

    async function toggleWebRTC() {
        if (isActive || shouldReconnect) {
            reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
            await stopWebRTC();
            return;
        }

        reconnectAttempts = 0;
        onDemandStartup404Attempts = 0;
        await startWebRTC();
    }

    async function handlePlayButtonClick(event) {
        if (event) {
            event.preventDefault();
        }

        const activeBackend = getActivePlaybackBackend();
        const selectedSource = applySelectedSourceValue(getSelectedSourceValue(), {
            persist: true,
            syncSelect: false
        });

        if (selectedSource === LEGACY_SOURCE_VALUE) {
            if (activeBackend === 'webrtc') {
                await stopWebRTC();
                startLegacyPlayback();
                return;
            }

            if (activeBackend === LEGACY_SOURCE_VALUE) {
                stopLegacyPlayback();
                return;
            }

            startLegacyPlayback();
            return;
        }

        if (activeBackend === LEGACY_SOURCE_VALUE) {
            stopLegacyPlayback();
        }

        await toggleWebRTC();
    }

    async function handleSourceSelectionChange() {
        const appliedSource = applySelectedSourceValue(getSelectedSourceValue(), {
            persist: true,
            syncSelect: true
        });
        const activeBackend = getActivePlaybackBackend();

        if (!activeBackend) {
            updateButtonState('disconnected');
            return;
        }

        if (appliedSource === LEGACY_SOURCE_VALUE) {
            if (activeBackend === 'webrtc') {
                await stopWebRTC();
                startLegacyPlayback();
            }
            return;
        }

        if (activeBackend === LEGACY_SOURCE_VALUE) {
            stopLegacyPlayback();
        } else {
            await stopWebRTC();
        }

        reconnectAttempts = 0;
        onDemandStartup404Attempts = 0;
        await startWebRTC();
    }

    function initIntegratedUi() {
        if ($('#fmdx-webrtc-integrated-style').length === 0) {
            $('<style>')
                .attr('id', 'fmdx-webrtc-integrated-style')
                .prop('type', 'text/css')
                .html(webrtcCss)
                .appendTo('head');
        }

        let attemptsLeft = 20;
        const tryAttachUi = () => {
            syncIntegratedPlaybackUi();
            if (getDesktopPlayButton().length > 0 || getMobilePlayButton().length > 0 || attemptsLeft <= 0) {
                return;
            }

            attemptsLeft--;
            setTimeout(tryAttachUi, 500);
        };

        // Let the native player scripts finish rendering first, otherwise our managed
        // button can be replaced when their UI initializes slightly later.
        setTimeout(tryAttachUi, UI_ATTACH_INITIAL_DELAY);
    }

    initIntegratedUi();
    updateButtonState('disconnected');

    fetchFlags()
        .then(() => fetchAvailableBitrates())
        .then(() => {
            syncIntegratedPlaybackUi();
        })
        .catch((error) => {
            console.warn('[WHEP] Failed to fetch bitrate profiles:', error);
            syncIntegratedPlaybackUi();
        });

    initVolumeControl();

    window.addEventListener('beforeunload', () => {
        shouldReconnect = false;
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        void stopWebRTC();
    });
})();
