var map;
var pin;
var tilesURL=' https://tile.openstreetmap.org/{z}/{x}/{y}.png';
var mapAttrib='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>';

$(document).ready(function() {
  loadConsoleLogs();
});

function stripAnsi(str) {
  return str.replace(/\u001b\[\d+m/g, '');
}

async function loadConsoleLogs() {
  await new Promise((resolve) => {
    $("pre").html(function (_, html) {
      html = stripAnsi(html);

      const logColors = {
        DEBUG: "cyan",
        ERROR: "red",
        INFO: "lime",
        WARN: "yellow",
      };

      let firstBracketProcessed = false;

      const processedHtml = html.replace(/\[([^\]]+)\]/g, function (match, content) {
        if (!firstBracketProcessed) {
          firstBracketProcessed = true;
          return `<span style='color: gray;'>${match}</span>`;
        }

        const color = logColors[content] || "white";
        return `<span style='color: ${color};'>${match}</span>`;
      });

      return processedHtml;
    });
    resolve();
  });
  $("#console-output").length ? $("#console-output").scrollTop($("#console-output")[0].scrollHeight) : null;
}
