class WebSocketAudioPlayer {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.audio = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.queue = [];
    this.started = false;
  }

  _trimBuffer() {
    if (!this.sourceBuffer.updating && this.audio.currentTime > 5) {
        this.sourceBuffer.remove(0, this.audio.currentTime - 2);
    }
  }

  start() {
    this.audio = new Audio();
    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', () => {
      this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
      this.sourceBuffer.addEventListener('updateend', () => this._appendNext());

      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onmessage = (event) => {
        this.queue.push(event.data);
        this._appendNext();
        if (!this.started && this.queue.length === 0) { this.audio.play(); this.started = true; }
        this._trimBuffer();
      };
      this.ws.onclose = () => {
        if (this.mediaSource.readyState === 'open') this.mediaSource.endOfStream();
      };
    });

    this.audio.addEventListener('canplay', () => {
      if (!this.started) { this.audio.play(); this.started = true; }
    });
  }

  stop() {
    this.ws?.close();
    this.audio?.pause();
    this.queue = [];
    this.started = false;
  }

  setVolume(v) {
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, v));
  }

  _appendNext() {
    if (this.sourceBuffer.updating || this.queue.length === 0) return;
    this.sourceBuffer.appendBuffer(this.queue.shift());
  }
}

let Stream = null;
let shouldReconnect = true;

function Init(_ev) {
    $(".playbutton").off('click').on('click', OnPlayButtonClick);
    $("#volumeSlider").off("input").on("input", updateVolume);
}

function createStream() {
    try {
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const audioUrl = `${wsProtocol}//${location.hostname}/audio`;
        Stream = new WebSocketAudioPlayer(audioUrl);
        Stream.setVolume($('#volumeSlider').val());
    } catch (error) {
        console.error("Initialization Error: ", error);
    }
}

function destroyStream() {
    if (Stream) {
        Stream.stop();
        Stream = null;
    }
}

function OnPlayButtonClick(_ev) {
    const $playbutton = $('.playbutton');
    const isAppleiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (Stream) {
        console.log("Stopping stream...");
        shouldReconnect = false;
        destroyStream();
        $playbutton.find('.fa-solid').toggleClass('fa-stop fa-play');
        if (isAppleiOS && 'audioSession' in navigator) navigator.audioSession.type = "none";
    } else {
        console.log("Starting stream...");
        shouldReconnect = true;
        createStream();
        Stream.start();
        $playbutton.find('.fa-solid').toggleClass('fa-play fa-stop');
        if (isAppleiOS && 'audioSession' in navigator) navigator.audioSession.type = "playback";
    }

    $playbutton.addClass('bg-gray').prop('disabled', true);
    setTimeout(() => $playbutton.removeClass('bg-gray').prop('disabled', false), 2500);
}

function updateVolume() {
    const newVolume = $(this).val();
    if (Stream) Stream.setVolume(newVolume);
    else console.warn("Stream is not initialized.");
}

$(document).ready(Init);
window.addEventListener('load', Init, false);