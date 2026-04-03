function tuneUp() {
    if (socket.readyState === WebSocket.OPEN) {
        getCurrentFreq();
        let addVal = 0;
        if (currentFreq < 0.52) addVal = 9 - (Math.round(currentFreq*1000) % 9);
        else if (currentFreq < 1.71) {
            var step = 9;
            if(localStorage.getItem('rdsMode') == 'true') step = 10
            addVal = step - (Math.round(currentFreq*1000) % step);
        } else if (currentFreq < 29.6) addVal = 5 - (Math.round(currentFreq*1000) % 5);
        else if (currentFreq >= 65.9 && currentFreq < 74) addVal = 30 - ((Math.round(currentFreq*1000) - 65900) % 30);
        else addVal = 100 - (Math.round(currentFreq*1000) % 100);
        socket.send("T" + (Math.round(currentFreq*1000) + addVal));
    }
}

function tuneDown() {
    if (socket.readyState === WebSocket.OPEN) {
        getCurrentFreq();
        let subVal = 0;
        if (currentFreq < 0.52) subVal = (Math.round(currentFreq*1000) % 9 == 0) ? 9 : (Math.round(currentFreq*1000) % 9);
        else if (currentFreq < 1.71) {
            var step = 9;
            if(localStorage.getItem('rdsMode') == 'true') step = 10
            subVal = (Math.round(currentFreq*1000) % step == 0) ? step : (Math.round(currentFreq*1000) % step);
        } else if (currentFreq < 29.6) subVal = (Math.round(currentFreq*1000) % 5 == 0) ? 5 : (Math.round(currentFreq*1000) % 5);
        else if (currentFreq > 65.9 && currentFreq <= 74) subVal = ((Math.round(currentFreq*1000) - 65900) % 30 == 0) ? 30 : ((Math.round(currentFreq*1000) - 65900) % 30);
        else subVal = (Math.round(currentFreq*1000) % 100 == 0) ? 100 : (Math.round(currentFreq*1000) % 100);
        socket.send("T" + (Math.round(currentFreq*1000) - subVal));
    }
}

function tuneTo(freq) {
    previousFreq = getCurrentFreq();
    socket.send("T" + ((parseFloat(freq)) * 1000).toFixed(0));
}

function resetRDS() {
    socket.send("T0");
}

function getCurrentFreq() {
    currentFreq = Math.round(parseFloat($('#data-frequency').text()) * 1000) / 1000;
    return currentFreq;
}
