var cm = CodeMirror(document.body, {
  value: ``,
  mode: "javascript",
  theme: "mbo",
  lineWrapping: true,
  matchBrackets: true,
  lint: { options: { esversion: 2021, asi: true } }
});

var facet_methods = [];

let mousex = 1, mousey = 1;
onmousemove = function (e) {
  mousex = e.clientX / window.innerWidth;
  mousey = Math.abs(1 - (e.clientY / window.innerHeight));
}

try {
  let facet_history = localStorage.getItem('facet_history');
  if (facet_history) {
    cm.setValue(facet_history);
  }
}
catch (e) {
  // do nothing because there's nothing saved in localStorage
}

function getFirstLineOfBlock(initial_line) {
  // true if line above is empty or the line number is 0
  let above_line_is_empty = false;
  let current_line_number = initial_line;
  let first_line;
  while (above_line_is_empty == false && current_line_number >= 0) {
    // check previous line for conditions that would indicate first line
    // of block; otherwise continue decrementing line number
    if ((current_line_number) == 0) {
      first_line = 0;
      break;
    }
    let line_above = cm.getLine(current_line_number - 1);
    if (line_above.trim() == '') {
      above_line_is_empty = true;
      first_line = current_line_number;
    }
    current_line_number--;
  }
  return first_line;
}

function getLastLineOfBlock(initial_line) {
  // true if line below is empty or the line number gets to cm.lineCount()
  let below_line_is_empty = false;
  let current_line_number = initial_line;
  let last_line;
  while (below_line_is_empty == false) {
    if ((current_line_number + 1) == cm.lineCount()) {
      last_line = current_line_number;
      break;
    }
    // check below line for conditions that would indicate last line
    // of block; otherwise continue incrementing line number
    let line_below = cm.getLine(current_line_number + 1);
    if (line_below.trim() == '') {
      below_line_is_empty = true;
      last_line = current_line_number;
    }
    current_line_number++;
  }
  return last_line;
}

// prevent accidental refreshes which would lose unsaved changes
window.onbeforeunload = function () {
  return "Are you sure you want to leave? Unsaved changes will be lost.";
};

$(document).keydown(function (e) {
  // [ctrl + enter] or [ctrl + r] to select text and send to pattern server :1123
  if (e.ctrlKey && (e.keyCode == 13 || e.keyCode == 82)) {
    runFacet();
  }
  else if (e.ctrlKey && e.keyCode == 188) {
    // clear hooks: [ctrl + ","]
    patternSocket.emit('clearHooks');
    $.growl.notice({ message: 'regeneration stopped' });
  }
  else if (e.ctrlKey && (e.keyCode == 190 || e.keyCode == 191)) {
    // clear hooks and mute everything: [ctrl + "."] or  [ctrl + "?"]
    
    // activate frontend gate immediately
    frontendGateActive = true;
    
    patternSocket.emit('stop');
    $.growl.notice({ message: 'all commands stopped' });
    
    // immediately clear all voice controls from UI (both DOM and canvas)
    const container = document.getElementById('voiceControls');
    if (container) {
      container.innerHTML = '';
      container.style.paddingTop = '0px';
    }
    
    // clear canvas voice controls
    if (voiceRenderer) {
      voiceRenderer.voices.clear();
      voiceRenderer.render();
    }
    if (soloRenderer) {
      soloRenderer.voices.clear();
      soloRenderer.render();
      soloRenderer.hide(); // hide solo renderer when stopping all
    }
    
    // enable global stop mode to prevent any new voice controls
    globalStopMode = true;
    
    // clear all related data
    mutedVoices = {};
    soloedVoices = {};
    lockedVoices = {};
    fpNameToVoiceMap = {};
    gainNodes = {};
    manualGainValues = {};
    recentlyStoppedVoices.clear();
    permanentlyStoppedVoices.clear();
    
    // reset global stop mode after a delay to allow server to process stop
    setTimeout(() => {
      globalStopMode = false;
    }, 3000); // 3 second delay
  }
  else if (e.ctrlKey && (e.keyCode == 222)) {
    // stop command(s)
    // get the current block to determine which patterns to stop
    let cursor = cm.getCursor();
    let line = cursor.line;
    let first_line_of_block = getFirstLineOfBlock(line);
    let last_line_of_block = getLastLineOfBlock(line);
    let blockCode = '';
    for (let i = first_line_of_block; i <= last_line_of_block; i++) {
      blockCode += cm.getLine(i) + '\n';
    }
    
    // extract pattern names from the block using regex
    // matches both $('name') and _name syntax
    const patternNameRegex = /(?:\$\(['"]([^'"]+)['"]\)|_(\w+))/g;
    const patternNamesToStop = [];
    let match;
    while ((match = patternNameRegex.exec(blockCode)) !== null) {
      // match[1] is from $('name') syntax, match[2] is from _name syntax
      const patternName = match[1] || match[2];
      patternNamesToStop.push(patternName);
    }
    
    runFacet('stop');
    $.growl.notice({ message: 'command(s) stopped' });
    
    // immediately remove voice controls for the stopped patterns
    const container = document.getElementById('voiceControls');
    if (container && patternNamesToStop.length > 0) {
      Array.from(container.children).forEach(child => {
        const voiceControlElement = child.querySelector('.voice-control');
        if (voiceControlElement) {
          const fpName = voiceControlElement.dataset.fpName;
          if (patternNamesToStop.includes(fpName)) {
            container.removeChild(child);
            delete mutedVoices[fpName];
            delete manualGainValues[fpName];
            recentlyStoppedVoices.set(fpName, Date.now());
            permanentlyStoppedVoices.add(fpName);
          }
        }
      });
      
      // adjust padding-top based on remaining children
      container.style.paddingTop = container.children.length === 0 ? '0px' : '10px';
      container.style.paddingBottom = container.children.length === 0 ? '0px' : '2px';
    }
  }
  else if (e.ctrlKey && (e.keyCode == 186 || e.keyCode == 59)) {
    // keep command(s)
    runFacet('keep');
    $.growl.notice({ message: 'command(s) generated and kept' });
  }
  else if (e.ctrlKey && (e.keyCode == 220)) {
    // command(s) run once
    runFacet('once');
    $.growl.notice({ message: 'command(s) generated to play once' });
  }

  // set bpm & unfocus the #bpm input when user hits enter while focused on it
  if ($('#bpm').is(':focus') && e.keyCode == 13) {
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
    $('#bpm').blur();
  }

  if ($('#time_signature_numerator').is(':focus') && e.keyCode == 13) {
    $('#time_signature_numerator').blur();
  }
  if ($('#time_signature_denominator').is(':focus') && e.keyCode == 13) {
    $('#time_signature_denominator').blur();
  }

  if (e.ctrlKey && e.keyCode === 70) {
    var cursor = cm.getCursor();
    var currentLine = cursor.line;
    let scroll_info = cm.getScrollInfo();
    cm.setValue(js_beautify(cm.getValue(), {
      indent_size: 2,
      break_chained_methods: true
    }))
    cm.focus();
    cm.setCursor({
      line: currentLine - 1
    });
    cm.scrollTo(scroll_info.left, scroll_info.top);
  }

  if (e.ctrlKey && e.code === 'Space') {
    patternSocket.emit('autocomplete');
  }

});

$(document).keyup(function (e) {
  // save the entire text block in localstorage
  localStorage.setItem('facet_history', cm.getValue());
});

function runFacet(mode = 'run') {
  // deactivate frontend gate when running new commands
  frontendGateActive = false;
  
  // select the entire block surrounding the cursor pos, based on if newlines exist above and below
  let cursor = cm.getCursor();
  let line = cursor.line;
  let first_line_of_block = getFirstLineOfBlock(line);
  let last_line_of_block = getLastLineOfBlock(line);
  // highlight the text that will run for 100ms
  cm.setSelection({ line: first_line_of_block, ch: 0 }, { line: last_line_of_block, ch: 10000 });
  // de-highlight, set back to initial cursor position
  setTimeout(function () { cm.setCursor({ line: line, ch: cursor.ch }); }, 100);
  setStatus(`processing`);
  let code = cm.getSelection();
  
  // when running new patterns, remove them from permanently stopped list so they can play
  if (mode === 'run' || mode === 'keep' || mode === 'once') {
    // matches both $('name') and _name syntax
    const patternNameRegex = /(?:\$\(['"]([^'"]+)['"]\)|_(\w+))/g;
    let match;
    while ((match = patternNameRegex.exec(code)) !== null) {
      // match[1] is from $('name') syntax, match[2] is from _name syntax
      const patternName = match[1] || match[2];
      permanentlyStoppedVoices.delete(patternName);
    }
  }
  
  patternSocket.emit('runCode', { code: code, mode: mode });
}

let midi_outs;

$('body').on('change', '#midi_outs', function () {
  localStorage.setItem('midi_outs_value', this.value);
  socket.emit('selectMidiOutput', { output: this.value });
});

$('body').on('click', '#midi_refresh', function () {
  socket.emit('getMidiPorts');
});

$('body').on('click', '#sound', function () {
  if (localStorage.getItem('facet_browser_sound_output') === 'true') {
    localStorage.setItem('facet_browser_sound_output', 'false');
    $.growl.notice({ message: 'browser sound is off.' });
    setBrowserSound('false');
  }
  else if (localStorage.getItem('facet_browser_sound_output') === 'false') {
    localStorage.setItem('facet_browser_sound_output', 'true');
    $.growl.notice({ message: 'browser sound is on.' });
    setBrowserSound('true');
  }
  else {
    // not initialized yet in localstorage, turn off on first click since browser sound is on by default
    localStorage.setItem('facet_browser_sound_output', 'false');
    setBrowserSound('false');
    $.growl.notice({ message: 'browser sound is off.' });
  }
});

$('body').on('click', '#stop', function () {
  // activate frontend gate immediately
  frontendGateActive = true;
  
  patternSocket.emit('stop');
  $.growl.notice({ message: 'all commands stopped' });
    
  // immediately clear all voice controls from UI
  const container = document.getElementById('voiceControls');
  if (container) {
    container.innerHTML = '';
    container.style.paddingTop = '0px';
  }
  
  // clear canvas voice controls
  if (voiceRenderer) {
    voiceRenderer.voices.clear();
    voiceRenderer.render();
  }
  if (soloRenderer) {
    soloRenderer.voices.clear();
    soloRenderer.render();
    soloRenderer.hide(); // Hide solo renderer when stopping all
  }
  
  // enable global stop mode to prevent any new voice controls
  globalStopMode = true;
  
  // clear all related data
  mutedVoices = {};
  soloedVoices = {};
  lockedVoices = {};
  fpNameToVoiceMap = {};
  gainNodes = {};
  manualGainValues = {};
  recentlyStoppedVoices.clear();
  permanentlyStoppedVoices.clear();
  soloRequests.clear(); // clear solo requests from all patterns
  lastSoloTimes.clear(); // clear per-pattern solo throttling
  pendingSoloUpdates.clear(); // clear pending solo updates
  lastSoloTimes.clear(); // clear per-pattern solo throttling
  pendingSoloUpdates.clear(); // clear pending solo updates
  soloRequests.clear(); // clear solo requests from all patterns
  
  // reset global stop mode after a delay to allow server to process stop
  setTimeout(() => {
    globalStopMode = false;
  }, 3000); // 3 second delay
});

$('body').on('click', '#clear', function () {
  patternSocket.emit('clearHooks');
  $.growl.notice({ message: 'regeneration stopped' });
});

$('body').on('click', '#rerun', function () {
  runFacet();
});

$('body').on('click', '#restart', function () {
  $.post(`http://${configSettings.HOST}:5831/restart`, {}).done(function (data, status) {
    if (status == 'success') {
      $.growl.notice({ message: 'Facet restarted successfully' });
    }
    else {
      $.growl.error({ message: 'There was an error while restarting Facet' });
    }
  });
});

let browser_sound_output = true;

$(document).ready(function () {
  $('#midi_refresh').click(); // request MIDI ports via ws
  try {
    setBrowserSound(localStorage.getItem('facet_browser_sound_output'));
  }
  catch (e) {
    // do nothing because there's nothing saved in localStorage
  }
});

function setBrowserSound(true_or_false_local_storage_string) {
  if (true_or_false_local_storage_string === 'true') {
    browser_sound_output = true;
    $('#sound').css('background', "url('../asset/spkr.png') no-repeat");
    $('#sound').css('background-size', "100% 200%");
  }
  else if (true_or_false_local_storage_string === 'false') {
    browser_sound_output = false;
    $('#sound').css('background', "url('../asset/spkr-off.png') no-repeat");
    $('#sound').css('background-size', "100% 200%");
  }
  else {
    browser_sound_output = true;
    $('#sound').css('background', "url('../asset/spkr.png') no-repeat");
    $('#sound').css('background-size', "100% 200%");
  }
  $.post(`http://${configSettings.HOST}:3211/browser_sound`, { browser_sound_output: browser_sound_output }).done(function (data, status) { });
}

// initialize MIDI selection from localStorage when requested
function initializeMIDISelection() {
  // retrieve the previously stored MIDI out destination from localstorage
  var storedValue = localStorage.getItem('midi_outs_value');
  if (storedValue && midi_outs && midi_outs.includes(storedValue)) {
    // reset the most recently used MIDI out destination
    $('#midi_outs').val(storedValue);
    socket.emit('selectMidiOutput', { output: storedValue });
  }
}

// adjust playback rates of audio files
function adjustPlaybackRates(currentBpm) {
  if (browser_sound_output === true) {
    for (let i = 1; i <= voices.length; i++) {
      if (voices[i] && sources[i]) {
        let voiceBpm = voices[i].bpm;
        let pitch = pitchShifts[i];

        // validate all values before calculating playback rate
        if (isFinite(currentBpm) && isFinite(voiceBpm) && isFinite(pitch) && 
            voiceBpm > 0 && currentBpm > 0 && pitch > 0) {
          const playbackRate = (currentBpm / voiceBpm) * pitch;
          
          // ensure playback rate is finite and within reasonable bounds
          if (isFinite(playbackRate) && playbackRate > 0 && playbackRate <= 16) {
            sources[i].forEach(source => {
              source.playbackRate.value = playbackRate;
            });
          }
        }
      }
    }
  }
}

let blockBpmUpdateFromServer;
let bpmCanBeUpdatedByServer = true;
$('body').on('change', '#bpm', function () {
  bpmCanBeUpdatedByServer = false;
  clearTimeout(blockBpmUpdateFromServer);
  blockBpmUpdateFromServer = setTimeout(function () {
    bpmCanBeUpdatedByServer = true;
  }, 3000);
});


// $('body').on('blur', '#bpm', function () {
//   let currentBpm = $(this).val();
//   if (!isNaN(currentBpm) && currentBpm >= 1) {
//     adjustPlaybackRates(currentBpm);
//   }
// });

$('body').on('blur', '#time_signature_numerator', () => {
  let user_input_time_signature_numerator = $('#time_signature_numerator').val();
  if (!isNaN(user_input_time_signature_numerator) && Math.abs(user_input_time_signature_numerator) >= 1) {
    time_signature_numerator = user_input_time_signature_numerator;
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }
});

$('body').on('blur', '#time_signature_denominator', () => {
  let user_input_time_signature_denominator = $('#time_signature_denominator').val();
  if (!isNaN(user_input_time_signature_denominator) && Math.abs(user_input_time_signature_denominator) >= 1) {
    time_signature_denominator = user_input_time_signature_denominator;
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }
});

// begin loop to check status of servers
checkStatus();

function checkStatus() {
  setInterval(() => {
    patternSocket.emit('status', {
      mousex: mousex,
      mousey: mousey
    });
  }, 250);
}

function setStatus(status) {
  let colored_span = '';
  if (status == 'connected') {
    colored_span = `<span style="color:green;"">●</span>`;
  }
  else if (status == 'processing') {
    colored_span = `<span style="color:green;"">●</span>`;
  }
  else if (status == 'disconnected') {
    colored_span = `<span style="color:red;"">●</span>`;
  }
  $('#status').html(colored_span);
}


let bpm = 90;
let prev_bpm = 90;
let time_signature_numerator = 4;
let prev_time_signature_numerator = 4;
let time_signature_denominator = 4;
let prev_time_signature_denominator = 4;

// check every 50ms for bpm or time signature change and send if changed
setInterval(() => {
  bpm = $('#bpm').val();
  time_signature_numerator = $('#time_signature_numerator').val();
  time_signature_denominator = $('#time_signature_denominator').val();

  // send change on increment/decrement by 1
  if (!isNaN(bpm) && bpm >= 1 && $('#bpm').is(':focus') && (Math.abs(bpm - prev_bpm) == 1)) {
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }

  if (!isNaN(time_signature_numerator) && $('#time_signature_numerator').is(':focus') && (Math.abs(time_signature_numerator - prev_time_signature_numerator) == 1)) {
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }

  if (!isNaN(time_signature_denominator) && $('#time_signature_denominator').is(':focus') && (Math.abs(time_signature_denominator - prev_time_signature_denominator) == 1)) {
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }

  prev_bpm = bpm;
  prev_time_signature_numerator = time_signature_numerator;
  prev_time_signature_denominator = time_signature_denominator;
}, 50);

$('#bpm').val(90);

let voices = [];
let sources = [];
let pitchShifts = {};
let lastPlayedTimes = {};
let ac;

let pendingLoads = new Map(); // track fetch requests in progress
let loadTiming = new Map(); // track timing of load operations
let requestedVoices = new Set(); // track which voices have been requested to load
let playRequestedVoices = new Set(); // track which voices have been requested to play
let patternVoiceHistory = new Map(); // track voice history by pattern name for fallback
ac = new AudioContext();
ac.destination.channelCount = ac.destination.maxChannelCount;
ac.destination.channelCountMode = "explicit";
ac.destination.channelInterpretation = "discrete";

// connect to the servers
const socket = io.connect(`http://${configSettings.HOST}:3000`, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

// connect to pattern generator server via WebSocket
const patternSocket = io.connect(`http://${configSettings.HOST}:1123`, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

// Set up pattern socket event handlers
patternSocket.on('autocompleteResponse', (data) => {
  facet_methods = data.methods;
  // forked custom hinting from: https://stackoverflow.com/a/39973139
  var options = {
    hint: function (editor) {
      var list = facet_methods;
      var cursor = editor.getCursor();
      var currentLine = editor.getLine(cursor.line);
      var start = cursor.ch;
      var end = start;
      while (end < currentLine.length && /[\w$]+/.test(currentLine.charAt(end))) ++end;
      while (start && /[\w$]+/.test(currentLine.charAt(start - 1))) --start;
      var curWord = start != end && currentLine.slice(start, end);
      var regex = new RegExp('^' + curWord, 'i');
      var result = {
        list: (!curWord ? list : list.filter(function (item) {
          return item.match(regex);
        })).sort(),
        from: CodeMirror.Pos(cursor.line, start),
        to: CodeMirror.Pos(cursor.line, end)
      };
      return result;
    }
  };
  cm.showHint(options);
});

patternSocket.on('error', () => {
  $.growl.error({ message: 'no connection to the Facet server' });
});

patternSocket.on('statusResponse', (data) => {
  Object.values(data.errors).forEach(error => {
    $.growl.error({ message: error });
  });
  let cpu_percent = Math.round(parseFloat(data.cpu).toFixed(2) * 100);
  cpu_percent = cpu_percent.toString().substring(0, 4);
  $('#cpu').html(`${cpu_percent}%&nbsp;cpu`);
  setStatus(`connected`);
});

patternSocket.on('disconnect', () => {
  setStatus(`disconnected`);
  $('#cpu').html(`[offline]`);
});

// handle direct audio data from pattern generator
patternSocket.on('audioData', (data) => {
  // if frontend gate is active, block all audio loading
  if (frontendGateActive) {
    return;
  }

  if (browser_sound_output === true) {
    const { name, data: audioData, bpm_at_generation_time, voice_number } = data;
    
    // track that this voice was requested to load
    requestedVoices.add(Number(voice_number));
    
    const startTime = Date.now();
    
    // convert audio data directly to AudioBuffer using the same sample rate as the pattern generator
    const audioBuffer = ac.createBuffer(1, audioData.length, configSettings.SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);
    
    // copy audio data to buffer
    for (let i = 0; i < audioData.length; i++) {
      channelData[i] = audioData[i];
    }
    
    const totalTime = Date.now() - startTime;
    
    // add the audioBuffer directly to the voices object
    voices[voice_number] = { buffer: audioBuffer, bpm: bpm_at_generation_time };

    // track this voice in pattern history when it's successfully loaded
    // extract pattern name
    const patternName = name.split('---')[0];
    
    if (!patternVoiceHistory.has(patternName)) {
      patternVoiceHistory.set(patternName, []);
    }
    
    const voiceHistory = patternVoiceHistory.get(patternName);
    voiceHistory.push(voice_number);
    
    // keep only last 10 voices for each pattern
    if (voiceHistory.length > 10) {
      voiceHistory.shift();
    }

    // track that this voice has played for the pattern
    playRequestedVoices.add(Number(voice_number));
  }
});

class TransportRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.progress = 0;
    
    this.setupCanvas();
  }
  
  setupCanvas() {
    // Set canvas size with DPI scaling
    // Use window width for 100% width canvas, and fixed height from CSS
    const width = window.innerWidth;
    const height = 10; // Fixed height from CSS
    const dpr = window.devicePixelRatio || 1;
    
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
    
    // Set canvas style dimensions
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    
    this.render();
  }
  
  updateProgress(progress) {
    this.progress = Math.max(0, Math.min(1, progress));
    this.render();
  }
  
  render() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    // Draw background
    this.ctx.fillStyle = '#afafaf';
    this.ctx.fillRect(0, 0, width, height);
    
    // Draw progress
    this.ctx.fillStyle = '#2c2c2c';
    this.ctx.fillRect(0, 0, Math.round(this.progress * width), height);
  }
  
  resize() {
    // Use requestAnimationFrame to ensure layout is complete before resizing
    requestAnimationFrame(() => {
      this.setupCanvas();
    });
  }
}

let transportRenderer = null;

document.addEventListener('DOMContentLoaded', () => {
  transportRenderer = new TransportRenderer('progress_bar_canvas');
  
  // handle window resize
  window.addEventListener('resize', () => {
    if (transportRenderer) {
      transportRenderer.resize();
    }
    // also handle voice control renderers that depend on window height
    if (voiceRenderer) {
      requestAnimationFrame(() => {
        voiceRenderer.setupCanvas();
        voiceRenderer.updateCanvasSize();
        voiceRenderer.render();
      });
    }
    if (soloRenderer) {
      requestAnimationFrame(() => {
        soloRenderer.setupCanvas();
        soloRenderer.updateCanvasSize();
        soloRenderer.render();
      });
    }
  });
});

// Update transport progress bar
socket.on('progress', (progress) => {
  if (transportRenderer) {
    transportRenderer.updateProgress(progress);
  }
});

// Update transport progress bar
socket.on('progress', (progress) => {
  if (transportRenderer) {
    transportRenderer.updateProgress(progress);
  }
});

socket.on('time_signature_numerator', (numerator) => {
  // if frontend gate is active, block time signature updates
  if (frontendGateActive) {
    return;
  }
  
  if (!$('#time_signature_numerator').is(':focus') && prev_time_signature_numerator !== numerator) {
    $('#time_signature_numerator').val(`${numerator}`);
  }
})

socket.on('time_signature_denominator', (denominator) => {
  // if frontend gate is active, block time signature updates
  if (frontendGateActive) {
    return;
  }
  
  if (!$('#time_signature_denominator').is(':focus') && prev_time_signature_denominator !== denominator) {
    $('#time_signature_denominator').val(`${denominator}`);
  }
})

socket.on('bpm', (bpm) => {
  // if frontend gate is active, block BPM updates
  if (frontendGateActive) {
    return;
  }

  if (!$('#bpm').is(':focus') && bpmCanBeUpdatedByServer === true) {
    $('#bpm').val(`${bpm}`);
  }
  adjustPlaybackRates($('#bpm').val());
});

// handle socket connection
socket.on('connect', () => {
  // request MIDI ports when connected
  socket.emit('getMidiPorts');
  
  // also send stored MIDI device immediately on connection
  const storedMidiDevice = localStorage.getItem('midi_outs_value');
  if (storedMidiDevice) {
    socket.emit('storedMidiDevice', { output: storedMidiDevice });
  }
  
  // request current mute states for synchronization
  setTimeout(() => {
    socket.emit('requestMuteStates');
  }, 100);
});

// ws event handler for MIDI ports response
socket.on('midiPorts', (data) => {
  // only update if we don't have MIDI devices yet or if they've actually changed
  if (!midi_outs || JSON.stringify(data) !== JSON.stringify(midi_outs)) {
    midi_outs = data;
    const currentSelection = $('#midi_outs').val(); // preserve current selection
    $('#midi_outs').html(''); // clear existing options
    $('#midi_outs').append('<option value="">-- MIDI output --</option>');
    for (var i = 0; i < midi_outs.length; i++) {
      let midi_out = midi_outs[i];
      $('#midi_outs').append('<option value="' + midi_out + '">' + midi_out + '</option>');
    }
    
    // restore the selection and always ensure it's sent to the server
    let valueToRestore = currentSelection;
    if (!valueToRestore) {
      // if no current selection, try to restore from localStorage
      valueToRestore = localStorage.getItem('midi_outs_value');
    }
    
    if (valueToRestore && midi_outs.includes(valueToRestore)) {
      $('#midi_outs').val(valueToRestore);
      // always send the selection to the server to ensure it's properly set
      socket.emit('selectMidiOutput', { output: valueToRestore });
    }
  }
});

// ws event handler for MIDI selection response
socket.on('midiSelectResponse', (data) => {
  if (data.status === 'error') {
    $.growl.error({ message: 'MIDI selection error: ' + data.error });
  }
});

// handle transport server requesting stored MIDI device
socket.on('requestStoredMidiDevice', () => {
  const storedMidiDevice = localStorage.getItem('midi_outs_value');
  socket.emit('storedMidiDevice', { output: storedMidiDevice || '' });
});

let mutedVoices = {};
let soloedVoices = {}; // track which voices are soloed
let lockedVoices = {}; // track which voices are locked from programmatic solo
let fpNameToVoiceMap = {};
let gainNodes = {};
let manualGainValues = {}; // track manual gain values for each voice (0-1)
let recentlyStoppedVoices = new Map(); // track voices recently stopped with timestamps
let permanentlyStoppedVoices = new Set(); // track voices that should never be re-added until cleared
let globalStopMode = false; // when true prevents ALL voice controls from being created
let frontendGateActive = false; // when true blocks all audio playback, bpm updates, and UI updates

class VoiceControlRenderer {
  constructor(canvasId, containerType = 'voice') {
    this.canvas = document.getElementById(canvasId);
    if (this.canvas) {
    }
    this.ctx = (this.canvas && this.canvas.getContext) ? this.canvas.getContext('2d') : null;
    this.containerType = containerType;
    this.voices = new Map(); // fpName -> voice control data
    this.hoveredElement = null;
    this.scrollY = 0;
    this.maxScrollY = 0;
    this.contentHeight = 0;
    this.visibleHeight = 0;
    this.isDragging = false;
    this.dragTarget = null; // { type, fpName, button }
    if (this.canvas && this.ctx) {
      this.setupCanvas();
      this.setupEventListeners();
    }
  }
  
  setupCanvas() {
    if (!this.canvas || !this.ctx) return;
    // set canvas size and DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = 200;
    const maxHeight = this.containerType === 'voice' ? window.innerHeight - 50 : 100;
    
    this.canvas.width = canvasWidth * dpr;
    this.canvas.height = maxHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.canvas.style.width = canvasWidth + 'px';
    this.canvas.style.height = maxHeight + 'px';
  }
  
  setupEventListeners() {
    let isMouseDown = false;
    let currentDragTarget = null;
    
    // mouse down - start potential drag
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isMouseDown = true;
      
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top + this.scrollY;
      
      // find clicked voice and button
      for (const [fpName, voiceData] of this.voices) {
        if (clickY >= voiceData.y && clickY <= voiceData.y + voiceData.height) {
          for (const button of voiceData.buttons) {
            if (clickX >= button.x && clickX <= button.x + button.width &&
                clickY >= voiceData.y + button.y && clickY <= voiceData.y + button.y + button.height) {
              
              if (button.type === 'gain') {
                currentDragTarget = { fpName, button };
                this.updateSliderFromMouse(e, currentDragTarget);
              } else {
                this.handleButtonClick(button.type, fpName, e);
              }
              return;
            }
          }
        }
      }
    });
    
    // mouse move - update slider if dragging
    const handleMouseMove = (e) => {
      if (isMouseDown && currentDragTarget) {
        e.preventDefault();
        this.updateSliderFromMouse(e, currentDragTarget);
      }
    };
    
    // mouse up - stop drag
    const handleMouseUp = (e) => {
      isMouseDown = false;
      currentDragTarget = null;
    };
    
    // catch all mouse events
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
  }
  
  updateSliderFromMouse(e, dragTarget) {
    if (!dragTarget || !dragTarget.button) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const button = dragTarget.button;
    const fpName = dragTarget.fpName;
    
    // calculate position within slider
    const sliderStart = button.x;
    const sliderWidth = button.width - 10;
    const relativeX = mouseX - sliderStart;
    
    // calculate gain: allow full range of motion but clamp the actual gain value
    const gainRatio = relativeX / sliderWidth;
    const newGain = Math.max(0, Math.min(1, gainRatio));
    
    // always update the gain, even if dragging outside bounds
    manualGainValues[fpName] = newGain;
    updateVoiceGain(fpName);
    this.render();
  }
  
  updateCanvasSize() {
    const contentHeight = this.containerType === 'solo' 
      ? Math.max(35, this.voices.size * 35 + 10)  // keep solo elements more compact
      : Math.max(200, this.voices.size * 65 + 30); // reduce spacing between main voices
    
    const maxHeight = this.containerType === 'voice' ? window.innerHeight - 50 : 100;
    const actualHeight = this.containerType === 'solo' ? Math.min(contentHeight + 10, maxHeight) : Math.min(contentHeight, maxHeight); // Minimal padding for solo
    
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = 200; // fixed width
    
    // update canvas dimensions to fixed size for scrolling
    this.canvas.width = canvasWidth * dpr;
    this.canvas.height = actualHeight * dpr;
    this.canvas.style.width = canvasWidth + 'px';
    this.canvas.style.height = actualHeight + 'px';
    
    // update scroll limits based on content vs visible height
    this.contentHeight = contentHeight;
    this.visibleHeight = actualHeight - (this.containerType === 'solo' ? 10 : 0);
    this.maxScrollY = Math.max(0, this.contentHeight - this.visibleHeight);
    
    // re-scale context after size change
    this.ctx.scale(dpr, dpr);
  }
  
  addVoice(fpName, patternType = 'audio') {  
    const gridSpacing = this.containerType === 'solo' ? 35 : 65;
    const topPadding = this.containerType === 'solo' ? 8 : 10;
    const voiceData = {
      fpName,
      patternType,
      isSoloControl: this.containerType === 'solo',
      y: topPadding + (this.voices.size * gridSpacing),
      height: this.containerType === 'solo' ? 30 : 60,
      buttons: this.getButtonLayout(patternType, this.containerType === 'solo')
    };
    
    this.voices.set(fpName, voiceData);
    
    this.updateCanvasSize();
    this.updateScrollLimits();
    this.render();
  }
  
  removeVoice(fpName) {
    this.voices.delete(fpName);
    this.repositionVoices();
    this.updateCanvasSize();
    this.updateScrollLimits();
    this.render();
    
    // hide solo renderer if no voices remain
    if (this.containerType === 'solo' && this.voices.size === 0) {
      this.hide();
    }
  }
  
  repositionVoices() {
    // make voices always snap to consistent grid positioning
    const gridSpacing = this.containerType === 'solo' ? 35 : 65;
    const topPadding = this.containerType === 'solo' ? 8 : 10;
    let gridIndex = 0;
    for (const [fpName, voiceData] of this.voices) {
      voiceData.y = topPadding + (gridIndex * gridSpacing);
      gridIndex++;
    }
  }
  
  updateScrollLimits() {
    const gridSpacing = this.containerType === 'solo' ? 35 : 65;
    const totalHeight = (this.voices.size * gridSpacing) + 20;
    const canvasHeight = parseInt(this.canvas.style.height);
    this.maxScrollY = Math.max(0, totalHeight - canvasHeight);
  }
  
  getButtonLayout(patternType, isSoloControl) {
    const buttons = [];
    
    // main voice control button (mute/unmute)
    buttons.push({
      type: 'mute',
      x: 10,
      y: 10,
      width: isSoloControl ? 140 : 100,
      height: 25
    });
    
    if (!isSoloControl) {
      // solo button
      buttons.push({
        type: 'solo',
        x: 115,
        y: 10,
        width: 35,
        height: 25
      });
      
      // lock button
      buttons.push({
        type: 'lock',
        x: 155,
        y: 10,
        width: 35,
        height: 25
      });
    }
    
    // stop button
    buttons.push({
      type: 'stop',
      x: isSoloControl ? 155 : 155,
      y: isSoloControl ? 10 : 40,
      width: 35,
      height: 25
    });
    
    // gain slider (only for audio patterns)
    if (!isSoloControl && patternType === 'audio') {
      buttons.push({
        type: 'gain',
        x: 10,
        y: 40,
        width: 140,
        height: 20
      });
    }
    
    return buttons;
  }
  
  render() {
    const ctx = this.ctx;
    if (!this.canvas || !ctx) return;
    const canvasWidth = 200;
    const canvasHeight = parseInt(this.canvas.style.height) || 100;
    
    // clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // set font
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // render each voice control
    for (const [fpName, voiceData] of this.voices) {
      const adjustedY = voiceData.y - this.scrollY;
      
      // skip rendering if outside visible area
      if (adjustedY + voiceData.height < 0 || adjustedY > canvasHeight) {
        continue;
      }
      
      this.renderVoiceControl(ctx, fpName, voiceData, adjustedY);
    }
  }
  
  renderVoiceControl(ctx, fpName, voiceData, y) {
    const isMuted = mutedVoices[fpName];
    const isSoloed = soloedVoices[fpName];
    const isLocked = lockedVoices[fpName];
    const anyVoicesSoloed = Object.values(soloedVoices).some(solo => solo);
    
    // render each button
    for (const button of voiceData.buttons) {
      const buttonY = y + button.y;
      
      this.renderButton(ctx, button, buttonY, fpName, {
        isMuted,
        isSoloed,
        isLocked,
        anyVoicesSoloed,
        isSoloControl: voiceData.isSoloControl
      });
    }
  }
  
  renderButton(ctx, button, y, fpName, state) {
    const { x, width, height, type } = button;
    
    // determine button color based on state and type
    let bgColor = '#666';
    let textColor = 'white';
    let text = '';
    
    switch (type) {
      case 'mute':
        if (state.isSoloControl) {
          // solo controls: simple green/dark grey
          bgColor = state.isMuted ? '#303030' : '#4caf50';
          text = fpName;
        } else {
          // regular controls: three-state coloring
          if (state.isMuted) {
            bgColor = '#303030';
          } else if (state.anyVoicesSoloed && !state.isSoloed) {
            bgColor = '#505050';
          } else {
            bgColor = '#4caf50';
          }
          text = fpName;
        }
        break;
        
      case 'solo':
        bgColor = state.isSoloed ? '#ff9800' : '#666';
        text = 'solo';
        break;
        
      case 'lock':
        bgColor = state.isLocked ? '#f44336' : '#666';
        text = '🔒';
        break;
        
      case 'stop':
        bgColor = '#aa2424';
        text = 'stop';
        break;
        
      case 'gain':
        // render gain slider
        this.renderGainSlider(ctx, x, y, width, height, fpName);
        return;
    }
    
    // draw button background
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, width, height);
    
    // draw button border
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    // draw button text
    ctx.fillStyle = textColor;
    ctx.fillText(text, x + width/2, y + height/2);
  }
  
  renderGainSlider(ctx, x, y, width, height, fpName) {
    const gain = manualGainValues[fpName];
    
    // slider track
    ctx.fillStyle = '#555';
    ctx.fillRect(x, y + height/3, width, height/3);
    
    // slider thumb
    const thumbX = x + (gain * (width - 10));
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(thumbX, y, 10, height);
  }
  
  handleButtonClick(buttonType, fpName, e) {
    switch (buttonType) {
      case 'mute':
        const isMuted = !mutedVoices[fpName];
        mutedVoices[fpName] = isMuted;
        updateVoiceGain(fpName);
        socket.emit('midiMuteToggle', { fp_name: fpName, muted: isMuted });
        break;
        
      case 'solo':
        const wasSoloed = soloedVoices[fpName];
        soloedVoices[fpName] = !wasSoloed;
        // send solo state to server for MIDI/OSC patterns
        socket.emit('midiSoloToggle', { fp_name: fpName, soloed: !wasSoloed });
        Object.keys(soloedVoices).forEach(voiceName => {
          updateVoiceGain(voiceName);
        });
        break;
        
      case 'lock':
        lockedVoices[fpName] = !lockedVoices[fpName];
        break;
        
      case 'stop':
        recentlyStoppedVoices.set(fpName, Date.now());
        permanentlyStoppedVoices.add(fpName);
        this.removeVoice(fpName);
        delete mutedVoices[fpName];
        delete soloedVoices[fpName];
        delete lockedVoices[fpName];
        delete manualGainValues[fpName];
        // remove solo requests for this pattern
        soloRequests.delete(fpName);
        // remove per-pattern throttling data
        lastSoloTimes.delete(fpName);
        const pendingTimeout = pendingSoloUpdates.get(fpName);
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          pendingSoloUpdates.delete(fpName);
        }
        // rebuild solo state after removing this pattern
        rebuildSoloState();
        patternSocket.emit('runCode', { code: `$('${fpName}').stop()`, mode: 'stop' });
        break;
    }
    
    // show updated button states
    this.render();
  }
  
  handleWheel(e) {
    e.preventDefault();
    this.scrollY += e.deltaY * 0.5;
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollY));
    this.render();
  }
  
  show() {
    if (this.canvas && this.canvas.style) {
      this.canvas.style.display = 'block';
    }
  }
  
  hide() {
    if (this.canvas && this.canvas.style) {
      this.canvas.style.display = 'none';
    }
  }
  
  removeVoice(fpName) {
    this.voices.delete(fpName);
    this.repositionVoices();
    this.updateCanvasSize();
    this.updateScrollLimits();
    this.render();
    
    // hide solo renderer if no voices remain
    if (this.containerType === 'solo' && this.voices.size === 0) {
      this.hide();
    }
  }
  
  repositionVoices() {
    let y = 10;
    for (const [fpName, voiceData] of this.voices) {
      voiceData.y = y;
      y += voiceData.height + 3;
    }
  }
}

// initialize canvas renderers
let voiceRenderer, soloRenderer;

// initialize canvas system on page load
document.addEventListener('DOMContentLoaded', () => {
  voiceRenderer = new VoiceControlRenderer('voiceControlsCanvas', 'voice');
  soloRenderer = new VoiceControlRenderer('soloControlsCanvas', 'solo');
});

// helper function to update voice control styling
function updateVoiceControlStyling(fpName) {
  // trigger re-render for canvas-based controls
  if (voiceRenderer && voiceRenderer.voices.has(fpName)) {
    voiceRenderer.render();
  }
  if (soloRenderer && soloRenderer.voices.has(fpName)) {
    soloRenderer.render();
  }
}

// helper function to update voice gain based on mute/solo state
function updateVoiceGain(fpName) {
  const voice_to_play = fpNameToVoiceMap[fpName];
  if (voice_to_play) {
    const fadeDuration = 0.005; // 5ms
    const currentTime = ac.currentTime;
    
    // check if any voices are soloed
    const anyVoicesSoloed = Object.values(soloedVoices).some(solo => solo);
    
    let shouldPlay = false;
    
    if (anyVoicesSoloed) {
      // if any voices are soloed, only play soloed voices (mute state is ignored)
      shouldPlay = soloedVoices[fpName];
    } else {
      // if no voices are soloed, use normal mute logic
      shouldPlay = !mutedVoices[fpName];
    }
    
    const targetGain = shouldPlay ? (manualGainValues[fpName] ?? 0.7) : 0;
    
    // update all channel gain nodes for this voice
    Object.keys(gainNodes).forEach(channelKey => {
      if (channelKey.startsWith(voice_to_play + '_')) {
        gainNodes[channelKey].gain.setTargetAtTime(targetGain, currentTime, fadeDuration);
      }
    });
  }
}

// shared method for synchronizing frontend and backend mute states
function syncMuteStates(fpNames, backendMuteStates) {
  fpNames.forEach(fpName => {
    if (mutedVoices.hasOwnProperty(fpName) && backendMuteStates.hasOwnProperty(fpName)) {
      const backendMuteState = backendMuteStates[fpName];
      
      // if frontend is unmuted but backend is muted, unmute the backend
      if (!mutedVoices[fpName] && backendMuteState) {
        socket.emit('midiMuteToggle', { fp_name: fpName, muted: false });
      }
      // if frontend is muted and backend state differs, sync to backend state
      else if (mutedVoices[fpName] && mutedVoices[fpName] !== backendMuteState) {
        mutedVoices[fpName] = backendMuteState;
        
        // update UI color using new logic
        const voiceControl = document.querySelector(`[data-fp-name="${fpName}"]`);
        if (voiceControl) {
          const anyVoicesSoloed = Object.values(soloedVoices).some(solo => solo);
          let effectivelyMuted;
          
          if (anyVoicesSoloed) {
            effectivelyMuted = !soloedVoices[fpName];
          } else {
            effectivelyMuted = backendMuteState;
          }
          
          updateVoiceControlStyling(fpName);
        }
        
        // update audio gain using new logic
        updateVoiceGain(fpName);
      }
    }
  });
}

// shared method for synchronizing frontend and backend solo states
function syncSoloStates(fpNames, backendSoloStates) {
  fpNames.forEach(fpName => {
    if (backendSoloStates.hasOwnProperty(fpName)) {
      const backendSoloState = backendSoloStates[fpName];
      soloedVoices[fpName] = backendSoloState;
      updateVoiceControlStyling(fpName);
    }
  });
}

socket.on('uniqueFpNames', (data) => {
  // if frontend gate is active, ignore all pattern updates
  if (frontendGateActive) {
    return;
  }

  // extract data from the websocket event
  const fpNames = data && data.names ? data.names : [];
  const patternTypes = data && data.types ? data.types : {};
  const backendMuteStates = data && data.muteStates ? data.muteStates : {};
  const backendSoloStates = data && data.soloStates ? data.soloStates : {};

  // separate solo patterns from regular patterns
  const soloPatterns = [];
  const regularPatterns = [];
  
  if (fpNames && fpNames.length > 0) {
    fpNames.forEach(fpName => {
      if (patternTypes[fpName] === 'solo') {
        soloPatterns.push(fpName);
      } else {
        regularPatterns.push(fpName);
      }
    });
  }

  // show/hide solo canvas based on whether there are solo patterns
  if (soloRenderer) {
    if (soloPatterns.length > 0) {
      soloRenderer.show();
    } else {
      soloRenderer.hide();
    }
  }

  // create separate sets for canvas renderers to track what's actually in each UI
  const currentRegularVoices = voiceRenderer ? new Set(voiceRenderer.voices.keys()) : new Set();
  const currentSoloVoices = soloRenderer ? new Set(soloRenderer.voices.keys()) : new Set();

  // add new voices - but only if not in global stop mode  
  if (!globalStopMode) {
    // process regular patterns using canvas renderer
    if (regularPatterns && regularPatterns.length > 0 && voiceRenderer) {
      regularPatterns.forEach(fpName => {
        if (!currentRegularVoices.has(fpName) && 
            !recentlyStoppedVoices.has(fpName) && 
            !permanentlyStoppedVoices.has(fpName)) {
          
          // Initialize state
          mutedVoices[fpName] = false;
          soloedVoices[fpName] = false;
          lockedVoices[fpName] = false;
          
          // Initialize manual gain value
          if (!(fpName in manualGainValues)) {
            manualGainValues[fpName] = 0.7;
          }
          
          // Add to canvas renderer
          voiceRenderer.addVoice(fpName, patternTypes[fpName]);
          
          // Apply initial gain
          setTimeout(() => updateVoiceGain(fpName), 50);
        }
      });
    }
    
    // process solo patterns using canvas renderer  
    if (soloPatterns && soloPatterns.length > 0 && soloRenderer) {
      soloRenderer.show();
      
      soloPatterns.forEach(fpName => {
        if (!currentSoloVoices.has(fpName) && 
            !recentlyStoppedVoices.has(fpName) && 
            !permanentlyStoppedVoices.has(fpName)) {
          
          // Initialize state
          mutedVoices[fpName] = false;
          soloedVoices[fpName] = false;
          lockedVoices[fpName] = false;
          
          // Add to canvas renderer
          soloRenderer.addVoice(fpName, patternTypes[fpName]);
          
          // Apply initial gain
          setTimeout(() => updateVoiceGain(fpName), 50);
        }
      });
    } else if (soloRenderer) {
      soloRenderer.hide();
    }
  }

  // sync existing voices with backend mute states
  const allFpNames = [...regularPatterns, ...soloPatterns];
  syncMuteStates(allFpNames, backendMuteStates);
  syncSoloStates(allFpNames, backendSoloStates);

  // remove voices from sidebar canvas that are no longer in the data or are permanently stopped
  function cleanupCanvasRenderer(renderer, fpNames) {
    if (!renderer) return;
    
    const voicesToRemove = [];
    for (const [fpName] of renderer.voices) {
      if (!fpNames || fpNames.length === 0 || !fpNames.includes(fpName) || permanentlyStoppedVoices.has(fpName)) {
        voicesToRemove.push(fpName);
        delete mutedVoices[fpName];
        delete soloedVoices[fpName];
        delete lockedVoices[fpName];
        // remove solo requests for stopped patterns
        soloRequests.delete(fpName);
        // remove per-pattern throttling data
        lastSoloTimes.delete(fpName);
        const pendingTimeout = pendingSoloUpdates.get(fpName);
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          pendingSoloUpdates.delete(fpName);
        }
        // only delete manual gain values if permanently stopped, not during regeneration
        if (permanentlyStoppedVoices.has(fpName)) {
          delete manualGainValues[fpName];
        }
        recentlyStoppedVoices.delete(fpName); // clean up tracking when server confirms removal
      }
    }
    
    // remove voices from canvas
    voicesToRemove.forEach(fpName => renderer.removeVoice(fpName));
    
    // rebuild solo state after removing patterns
    if (voicesToRemove.length > 0) {
      rebuildSoloState();
    }
  }

  // clean up regular voice controls
  cleanupCanvasRenderer(voiceRenderer, regularPatterns);
  
  // clean up solo controls
  cleanupCanvasRenderer(soloRenderer, soloPatterns);
});

// periodically clean up old entries from recentlyStoppedVoices to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [fpName, timestamp] of recentlyStoppedVoices.entries()) {
    if (now - timestamp > 2000) { // remove entries older than 2 seconds
      recentlyStoppedVoices.delete(fpName);
    }
  }
}, 5000); // run cleanup every 5 seconds

// periodically ensure permanently stopped voices are removed from UI
// this catches cases where server sends new uniqueFpNames events that try to re-add stopped patterns
setInterval(() => {
  const container = document.getElementById('voiceControls');
  if (container && permanentlyStoppedVoices.size > 0) {
    let removedAny = false;
    Array.from(container.children).forEach(child => {
      const voiceControlElement = child.querySelector('.voice-control');
      if (voiceControlElement) {
        const fpName = voiceControlElement.dataset.fpName;
        if (permanentlyStoppedVoices.has(fpName)) {
          container.removeChild(child);
          delete mutedVoices[fpName];
          delete manualGainValues[fpName];
          removedAny = true;
        }
      }
    });
    
    if (removedAny) {
      // adjust padding-top based on remaining children
      container.style.paddingTop = container.children.length === 0 ? '0px' : '10px';
      container.style.paddingBottom = container.children.length === 0 ? '0px' : '2px';
    }
  }
}, 1000); // run every second to catch regenerating patterns quickly

let mergerNodes = {};

socket.on('play', (data) => {
  // if frontend gate is active, block all audio playback
  if (frontendGateActive) {
    return;
  }

  const voice_to_play = data.voice;
  const pitch = data.pitch;
  const channels = data.channels;
  const pan_data = data.pan_data;

  // Track that this voice was requested to play
  playRequestedVoices.add(Number(voice_to_play));

  // immediately block playback if pattern is permanently stopped or in global stop mode
  if (permanentlyStoppedVoices.has(data.fp_name) || globalStopMode) {
    return; // don't play audio for stopped patterns
  }

  // map fp_name to voice_to_play
  fpNameToVoiceMap[data.fp_name] = voice_to_play;

  // track voice history for this pattern name at load time and play time
  if (!patternVoiceHistory.has(data.fp_name)) {
    patternVoiceHistory.set(data.fp_name, []);
  }
  
  // add current voice to history if it's loaded and not already there
  const voiceHistory = patternVoiceHistory.get(data.fp_name);
  if (voices[voice_to_play] && !voiceHistory.includes(voice_to_play)) {
    voiceHistory.push(voice_to_play);
    // keep only the last 5 voices for each pattern to avoid memory bloat
    if (voiceHistory.length > 5) {
      voiceHistory.shift();
    }
  }

  pitchShifts[voice_to_play] = pitch;

  if (browser_sound_output === true) {
    // check if the voice is loaded
    let actualVoiceToPlay = voice_to_play;
    let isFallback = false;
    
    if (voices[voice_to_play]) {
    } else {
      // voice did not load in time - try to find the previous voice for this pattern
      const voiceHistory = patternVoiceHistory.get(data.fp_name);
      
      if (voiceHistory && voiceHistory.length > 0) {
        // find the most recent loaded voice for this pattern (search backwards)
        for (let i = voiceHistory.length - 1; i >= 0; i--) {
          const fallbackVoice = voiceHistory[i];
          if (voices[fallbackVoice] && fallbackVoice !== voice_to_play) {
            actualVoiceToPlay = fallbackVoice;
            isFallback = true;
            break;
          }
        }
      }
    }
    
    // continue with playback using actualVoiceToPlay (either original or fallback)
    if (voices[actualVoiceToPlay]) {
      // merger is created once per voice
      if (!sources[actualVoiceToPlay]) {
        if (!mergerNodes[actualVoiceToPlay]) {
          mergerNodes[actualVoiceToPlay] = ac.createChannelMerger(ac.destination.maxChannelCount);
          mergerNodes[actualVoiceToPlay].connect(ac.destination);
        }
        sources[actualVoiceToPlay] = [];
      }

      // create audio source
      const source = ac.createBufferSource();
      source.buffer = voices[actualVoiceToPlay].buffer;
      
      // reset gain to baseline using solo/mute logic
      const manualGain = manualGainValues[data.fp_name] ?? 0.7;
      
      // check if any voices are soloed
      const anyVoicesSoloed = Object.values(soloedVoices).some(solo => solo);
      let shouldPlay = false;
      
      if (anyVoicesSoloed) {
        // if any voices are soloed, only play soloed voices
        shouldPlay = soloedVoices[data.fp_name];
      } else {
        // if no voices are soloed, use normal mute logic
        shouldPlay = !mutedVoices[data.fp_name];
      }

      channels.forEach((channel, index) => {
        // create individual gain nodes for each channel for panning
        const channelKey = `${actualVoiceToPlay}_${index}`;
        if (!gainNodes[channelKey]) {
          gainNodes[channelKey] = ac.createGain();
        }

        // connect the single source to each channel's gain node
        source.connect(gainNodes[channelKey]);
        gainNodes[channelKey].connect(mergerNodes[actualVoiceToPlay], 0, channel - 1);

        if (pan_data === false || channels.length === 1) {
          // no panning - equal gain for all channels
          gainNodes[channelKey].gain.value = shouldPlay ? manualGain : 0;
        } else {
          // apply panning using separate left/right channel gains
          if (channels.length === 2) {
            const isLeftChannel = index === 0;
            
            if (pan_data.length === 1) {
              const panValue = Math.max(0, Math.min(1, pan_data[0]));
              let channelGain;
              
              if (isLeftChannel) {
                // left channel is full at pan=0, no gain at pan=1
                channelGain = (1 - panValue) * manualGain;
              } else {
                // right channel is no gain at pan=0, full gain at pan=1
                channelGain = panValue * manualGain;
              }
              
              gainNodes[channelKey].gain.value = shouldPlay ? channelGain : 0;
            } else {
              // dynamic panning over time
              const durationPerValue = source.buffer.duration / pan_data.length;
              const transitionTime = 0.01; // 10ms smooth transition
              
              pan_data.forEach((panValue, i) => {
                const time = ac.currentTime + (i * durationPerValue);
                const clampedPanValue = Math.max(0, Math.min(1, panValue)); // clamp 0-1
                let channelGain;
                
                if (isLeftChannel) {
                  // left channel is full at pan=0, no gain at pan=1
                  channelGain = (1 - clampedPanValue) * manualGain;
                } else {
                  // right channel is no gain at pan=0, full gain at pan=1
                  channelGain = clampedPanValue * manualGain;
                }
                
                const finalGain = shouldPlay ? channelGain : 0;
                gainNodes[channelKey].gain.setTargetAtTime(finalGain, time, transitionTime);
              });
            }
          } else {
            // multi-channel panning
            const durationPerValue = source.buffer.duration / pan_data.length;
            const transitionTime = 0.01; // 10ms smooth transition
            pan_data.forEach((panValue, i) => {
              const time = ac.currentTime + (i * durationPerValue);
              const normalizedIndex = index / (channels.length - 1);
              const gainValue = Math.abs(normalizedIndex - panValue) <= 1 / (channels.length - 1)
                ? manualGain * (1 - Math.abs(normalizedIndex - panValue))
                : 0;
              gainNodes[channelKey].gain.setTargetAtTime(
                gainValue * (shouldPlay ? 1 : 0),
                time,
                transitionTime
              );
            });
          }
        }
      });

      try {
        source.start();
      } catch (error) {}
      
      sources[actualVoiceToPlay].push(source);
      lastPlayedTimes[actualVoiceToPlay] = Date.now();
    }
  }
});

// delete any sources that haven't been played in the past 1 minute to limit memory usage
setInterval(() => {
  let currentTime = Date.now();
  for (let voice in lastPlayedTimes) {
    if (currentTime - lastPlayedTimes[voice] > 60 * 1000) {
      if (sources[voice]) {
        sources[voice].forEach(source => {
          if (source.disconnect) {
            source.disconnect();
          }
        });
      }
      delete sources[voice];
      delete lastPlayedTimes[voice];
    }
  }
}, 60 * 1000);

socket.on('transport_cleanup', () => {
  // deactivate frontend gate when transport cleanly shuts down
  frontendGateActive = false;
  
  // clean up voices and related audio objects when transport shuts down
  voices = [];
  sources = [];
  pitchShifts = {};
  lastPlayedTimes = {};
  mutedVoices = {};
  soloedVoices = {};
  fpNameToVoiceMap = {};
  gainNodes = {};
  manualGainValues = {}; // clear manual gain values
  mergerNodes = {};
  recentlyStoppedVoices.clear(); // clear recently stopped tracking
  permanentlyStoppedVoices.clear(); // clear permanently stopped tracking
  patternVoiceHistory.clear(); // clear pattern voice history for fallback
  soloRequests.clear(); // clear solo requests from all patterns
  lastSoloTimes.clear(); // clear per-pattern solo throttling
  pendingSoloUpdates.clear(); // clear pending solo updates
  
  // clear canvas voice controls
  if (voiceRenderer) {
    voiceRenderer.voices.clear();
    voiceRenderer.render();
  }
  if (soloRenderer) {
    soloRenderer.voices.clear();
    soloRenderer.render();
    soloRenderer.hide(); // hide when stopping all
  }
  
  // clear the voice controls UI
  const container = document.getElementById('voiceControls');
  if (container) {
    container.innerHTML = '';
    container.style.paddingTop = '0px';
  }

});

// handle backend mute state confirmation to ensure sync
socket.on('muteStateConfirmation', (data) => {
  const { fp_name, muted } = data;
  
  // update frontend state to match confirmed backend state
  if (mutedVoices.hasOwnProperty(fp_name)) {
    mutedVoices[fp_name] = muted;
    
    // update UI color
    const voiceControl = document.querySelector(`[data-fp-name="${fp_name}"]`);
    if (voiceControl) {
      updateVoiceControlStyling(fp_name);
    }
  }
});

// handle requests for current mute states
socket.on('currentMuteStates', (backendMuteStates) => {
  // sync frontend states with backend, but prioritize keeping patterns unmuted
  syncMuteStates(Object.keys(mutedVoices), backendMuteStates);
});

// handle removal of once-played patterns from UI
socket.on('removeOncePattern', (data) => {
  const { fp_name } = data;
  
  // remove from canvas renderers
  if (voiceRenderer) {
    voiceRenderer.removeVoice(fp_name);
  }
  if (soloRenderer) {
    soloRenderer.removeVoice(fp_name);
  }
  
  // clean up related state
  delete mutedVoices[fp_name];
  delete soloedVoices[fp_name];
  delete lockedVoices[fp_name];
  delete manualGainValues[fp_name];
});

// throttle solo events to prevent performance issues
let lastSoloTimes = new Map(); // per-pattern throttling
let pendingSoloUpdates = new Map(); // per-pattern pending updates
const SOLO_THROTTLE_MS = 50; // limit to 20 times per second per pattern

// handle solo automation events
socket.on('solo', (data) => {
  const { fp_name, value } = data;
  
  // throttle solo updates per pattern to prevent lag from rapid events
  const now = Date.now();
  const lastTime = lastSoloTimes.get(fp_name) || 0;
  
  if (now - lastTime < SOLO_THROTTLE_MS) {
    // if throttling this pattern, store the latest update and schedule it
    const existingTimeout = pendingSoloUpdates.get(fp_name);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const newTimeout = setTimeout(() => {
      processSoloUpdate(fp_name, value);
      lastSoloTimes.set(fp_name, Date.now());
      pendingSoloUpdates.delete(fp_name);
    }, SOLO_THROTTLE_MS - (now - lastTime));
    
    pendingSoloUpdates.set(fp_name, newTimeout);
    return;
  }
  
  // process immediately if enough time has passed for this pattern
  processSoloUpdate(fp_name, value);
  lastSoloTimes.set(fp_name, now);
});

// cached voice names to avoid expensive DOM queries on every solo event
let cachedEligibleVoices = null;
let voicesCacheTime = 0;
const VOICE_CACHE_DURATION = 100; // cache for 100ms

// track solo requests from each pattern separately to support multiple concurrent solo patterns
let soloRequests = new Map();

function rebuildSoloState() {
  // get current eligible voices
  const allVoiceNames = getEligibleVoiceNames();
  
  // reset all unlocked voices (preserve locked voices' solo state)
  Object.keys(soloedVoices).forEach(voiceName => {
    if (!lockedVoices[voiceName]) {
      soloedVoices[voiceName] = false;
    }
  });
  
  // apply solo requests from all remaining active solo patterns
  const soloedVoiceNames = new Set();
  for (const [patternName, requestedVoice] of soloRequests) {
    if (requestedVoice && allVoiceNames.includes(requestedVoice)) {
      soloedVoices[requestedVoice] = true;
      soloedVoiceNames.add(requestedVoice);
    }
  }
  
  // send solo state to server for MIDI/OSC patterns
  allVoiceNames.forEach(voiceName => {
    const shouldBeSoloed = soloedVoices[voiceName] && !lockedVoices[voiceName];
    socket.emit('midiSoloToggle', { fp_name: voiceName, soloed: shouldBeSoloed });
  });
  
  // update all voice gains for audio patterns
  Object.keys(soloedVoices).forEach(voiceName => {
    updateVoiceGain(voiceName);
  });
  
  // update canvas displays
  if (voiceRenderer) {
    voiceRenderer.render();
  }
  if (soloRenderer) {
    soloRenderer.render();
  }
}

function getEligibleVoiceNames() {
  const now = Date.now();
  
  // use cached result if recent enough
  if (cachedEligibleVoices && (now - voicesCacheTime) < VOICE_CACHE_DURATION) {
    return cachedEligibleVoices;
  }
  
  // rebuild cache using canvas voice data for all pattern types (audio, MIDI, OSC)
  cachedEligibleVoices = [];
  
  if (voiceRenderer && voiceRenderer.voices) {
    for (const [voiceName, voiceData] of voiceRenderer.voices) {
      // exclude locked voices from programmatic solo targeting
      if (lockedVoices[voiceName]) {
        continue;
      }
      
      // include all patterns except solo patterns themselves
      if (voiceData.patternType !== 'solo') {
        cachedEligibleVoices.push(voiceName);
      }
    }
  }
  
  cachedEligibleVoices.sort();
  voicesCacheTime = now;
  return cachedEligibleVoices;
}

function processSoloUpdate(fp_name, value) {
  // normalize value to 0-1 range if needed
  let normalizedValue = Math.max(0, Math.min(1, value));
  
  // show solo renderer when automation becomes active
  if (soloRenderer && soloRenderer.voices.size === 0) {
    soloRenderer.show();
  }
  
  // get eligible voice names (cached for performance)
  const allVoiceNames = getEligibleVoiceNames();
  
  if (allVoiceNames.length === 0) {
    return; // no voices to solo
  }
  
  // map normalized value to voice index for this specific pattern
  const voiceIndex = Math.floor(normalizedValue * allVoiceNames.length);
  const targetVoiceName = allVoiceNames[Math.min(voiceIndex, allVoiceNames.length - 1)];
  
  // store this pattern's solo request
  soloRequests.set(fp_name, targetVoiceName);
  
  // rebuild solo state immediately 
  rebuildSoloState();
}