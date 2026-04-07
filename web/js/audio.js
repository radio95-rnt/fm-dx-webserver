class WebSocketAudioPlayer {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.audio = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.queue = [];
    this.started = false;
    this._volume = 1;
  }

  supported() {
    return MediaSource.isTypeSupported("audio/mpeg")
  }

  _syncToLive() {
    if (!this.audio || !this.sourceBuffer) return;
    const buffered = this.sourceBuffer.buffered;
    if (buffered.length === 0) return;

    const liveEdge = buffered.end(buffered.length - 1);
    const lag = liveEdge - this.audio.currentTime;

    if (lag > 1) this.audio.currentTime = liveEdge - 0.25;  // snap to near live edge
  }

  Start() {
    this.audio = new Audio();
    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', () => {
      this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
      this.sourceBuffer.addEventListener('updateend', () => this._appendNext());
      this.audio.addEventListener('waiting', () => this._syncToLive());
      this.audio.addEventListener('stalled', () => this._syncToLive());

      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onmessage = (event) => {
        this.queue.push(event.data);
        this._appendNext();
        if (!this.started && this.queue.length === 0) { this.audio.play(); this.started = true; }
      };
      this.ws.onclose = () => {
        if (this.mediaSource.readyState === 'open') this.mediaSource.endOfStream();
      };
    });

    this.audio.addEventListener('canplay', () => {
      if (!this.started) { this.audio.play(); this.started = true; }
    });
  }

  Stop() { // capital to match 3las
    this.ws?.close();
    this.audio?.pause();
    this.queue = [];
    this.started = false;
  }

  get Volume() {
    return this._volume;
  }
  set Volume(v) {
    const actual = Math.max(0, Math.min(1, v))
    if (this.audio) this.audio.volume = actual;
    this._volume = actual;
  }

  _appendNext() {
    if (this.sourceBuffer.updating || this.queue.length === 0) return;
    this.sourceBuffer.appendBuffer(this.queue.shift());
    this._syncToLive();
  }
}

let Stream = null;
let shouldReconnect = true;
let firefox = false;

function Init(_ev) {
    $(".playbutton").off('click').on('click', OnPlayButtonClick);
    $("#volumeSlider").off("input").on("input", updateVolume);
}

function createStream() {
  try {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProtocol}//${location.hostname}/audio`;

    if (MediaSource.isTypeSupported("audio/mpeg")) {
      firefox = false;
      Stream = new WebSocketAudioPlayer(url);
    } else {
      firefox = true;
      alert("Your browser does not support MP3 over MSE, meaning we have to use 3LAS which is terrible and gives terrible audio quality. If you want better sound, switch to anything chromium based")
      Stream = new _3LAS(url, null);
    }
    Stream.Volume = $('#volumeSlider').val();
  } catch (error) {
    console.error("Initialization Error: ", error);
  }
}

function destroyStream() {
    if (Stream) {
        Stream.Stop();
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
        $playbutton.find('.fa-solid')?.toggleClass('fa-stop fa-play');
        if (isAppleiOS && 'audioSession' in navigator) navigator.audioSession.type = "none";
    } else {
        console.log("Starting stream...");
        shouldReconnect = true;
        createStream();
        Stream.Start();
        $playbutton.find('.fa-solid')?.toggleClass('fa-play fa-stop');
        if (isAppleiOS && 'audioSession' in navigator) navigator.audioSession.type = "playback";
    }

    $playbutton.addClass('bg-gray').prop('disabled', true);
    setTimeout(() => $playbutton.removeClass('bg-gray').prop('disabled', false), 2000);
}

function updateVolume() {
  const newVolume = $(this).val();
  if(!Stream) {
    console.warn("Stream is not initialized.");
    return;
  }

  Stream.Volume = newVolume;
}

$(document).ready(Init);
window.addEventListener('load', Init, false);