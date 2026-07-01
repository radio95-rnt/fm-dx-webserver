const { spawn } = require('child_process');

module.exports = function() {
  return new Promise((resolve, reject) => {
    const checkFFmpegProcess = spawn('ffmpeg', ['-version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });

    checkFFmpegProcess.on('error', () => {
      resolve(require('ffmpeg-static'));
    });

    checkFFmpegProcess.on('exit', (code) => {
      if (code === 0) resolve('ffmpeg');
      else resolve(require('ffmpeg-static'));
    });
  });
}
