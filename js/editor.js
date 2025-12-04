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
    
    // immediately clear all voice controls from UI
    const container = document.getElementById('voiceControls');
    if (container) {
      container.innerHTML = '';
      container.style.paddingTop = '0px';
    }
    
    // enable global stop mode to prevent any new voice controls
    globalStopMode = true;
    
    // clear all related data
    mutedVoices = {};
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
    const patternNameRegex = /\$\(['"]([^'"]+)['"]\)/g;
    const patternNamesToStop = [];
    let match;
    while ((match = patternNameRegex.exec(blockCode)) !== null) {
      patternNamesToStop.push(match[1]);
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
  else if (e.ctrlKey && (e.keyCode == 78)) {
    // auto-add the begining of a new FacetPattern syntax at the current cursor position: $('').
    cm.replaceSelection("$('').");
    cm.setCursor(cm.getCursor().line, cm.getCursor().ch - 3);
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
    const patternNameRegex = /\$\(['"]([^'"]+)['"]\)/g;
    let match;
    while ((match = patternNameRegex.exec(code)) !== null) {
      permanentlyStoppedVoices.delete(match[1]);
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
  
  // enable global stop mode to prevent any new voice controls
  globalStopMode = true;
  
  // clear all related data
  mutedVoices = {};
  fpNameToVoiceMap = {};
  gainNodes = {};
  manualGainValues = {};
  recentlyStoppedVoices.clear();
  permanentlyStoppedVoices.clear();
  
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
    $('#sound').css('background', "url('../spkr.png') no-repeat");
    $('#sound').css('background-size', "100% 200%");
  }
  else if (true_or_false_local_storage_string === 'false') {
    browser_sound_output = false;
    $('#sound').css('background', "url('../spkr-off.png') no-repeat");
    $('#sound').css('background-size', "100% 200%");
  }
  else {
    browser_sound_output = true;
    $('#sound').css('background', "url('../spkr.png') no-repeat");
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

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('progress_bar_canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    function drawProgress(progress) {
      const width = canvas.width;
      const height = canvas.height;

      // clear the canvas
      ctx.clearRect(0, 0, width, height);

      // draw the background
      ctx.fillStyle = '#afafaf';
      ctx.fillRect(0, 0, width, height);

      // draw the progress bar
      ctx.fillStyle = '#2c2c2c';
      ctx.fillRect(0, 0, Math.round(progress * width), height);
    }

    // update the progress bar
    socket.on('progress', (progress) => {
      drawProgress(progress);
    });
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
let fpNameToVoiceMap = {};
let gainNodes = {};
let manualGainValues = {}; // track manual gain values for each voice (0-1)
let recentlyStoppedVoices = new Map(); // track voices recently stopped with timestamps
let permanentlyStoppedVoices = new Set(); // track voices that should never be re-added until cleared
let globalStopMode = false; // when true, prevents ALL voice controls from being created
let frontendGateActive = false; // when true, blocks all audio playback, bpm updates, and UI updates

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
        
        // update UI color
        const voiceControl = document.querySelector(`[data-fp-name="${fpName}"]`);
        if (voiceControl) {
          voiceControl.style.backgroundColor = backendMuteState ? '#303030' : 'green';
        }
        
        // update audio gain if it's an audio pattern
        const voice_to_play = fpNameToVoiceMap[fpName];
        if (voice_to_play && gainNodes[voice_to_play]) {
          const fadeDuration = 0.02;
          const currentTime = ac.currentTime;
          
          if (backendMuteState) {
            gainNodes[voice_to_play].gain.setTargetAtTime(0, currentTime, fadeDuration);
          } else {
            const targetGain = manualGainValues[fpName] ?? 0.7;
            gainNodes[voice_to_play].gain.setTargetAtTime(targetGain, currentTime, fadeDuration);
          }
        }
      }
    }
  });
}

socket.on('uniqueFpNames', (data) => {
  // if frontend gate is active, ignore all pattern updates
  if (frontendGateActive) {
    return;
  }
  const container = document.getElementById('voiceControls');

  // handle both old format (array) and new format (object with names and types)
  const fpNames = Array.isArray(data) ? data : (data && data.names ? data.names : []);
  const patternTypes = Array.isArray(data) ? {} : (data && data.types ? data.types : {});
  const backendMuteStates = Array.isArray(data) ? {} : (data && data.muteStates ? data.muteStates : {});

  // create set of current fpNames for comparison
  const currentFpNames = new Set(Object.keys(mutedVoices));

  // add new voices - but only if not in global stop mode
  if (fpNames && fpNames.length > 0 && !globalStopMode) {
    fpNames.forEach(fpName => {
      // check if this voice was recently stopped (within last 2 seconds)
      const recentlyStoppedTime = recentlyStoppedVoices.get(fpName);
      const isRecentlyStopped = recentlyStoppedTime && (Date.now() - recentlyStoppedTime < 2000);
      
      // also check if this voice is in the permanently stopped list
      const isPermanentlyStopped = permanentlyStoppedVoices.has(fpName);
    
    if (!currentFpNames.has(fpName) && !isRecentlyStopped && !isPermanentlyStopped) {
      // always default new patterns to unmuted in frontend
      mutedVoices[fpName] = false;
      
      // if backend has this pattern muted, unmute it immediately
      const backendMuteState = backendMuteStates.hasOwnProperty(fpName) ? backendMuteStates[fpName] : false;
      if (backendMuteState) {
        // send unmute command to backend immediately
        socket.emit('midiMuteToggle', { fp_name: fpName, muted: false });
      }
      
      // initialize manual gain value to 0.7 (default gain for audio patterns) only if not already set
      if (!(fpName in manualGainValues)) {
        manualGainValues[fpName] = 0.7;
      }

      // create a wrapper div to hold all controls
      const wrapperDiv = document.createElement('div');
      wrapperDiv.className = 'voice-wrapper';

      // create a row div to hold the voice-control and stop button
      const controlsRow = document.createElement('div');
      controlsRow.className = 'voice-controls-row';

      // create UI for mute/unmute
      const controlDiv = document.createElement('div');
      controlDiv.className = 'voice-control';
      controlDiv.dataset.fpName = fpName;

      // always start new patterns as (unmuted)
      controlDiv.style.backgroundColor = 'green';
      controlDiv.textContent = fpName;

      // click event handler for mute/unmute with debounce to prevent rapid clicking
      let lastClickTime = 0;
      controlDiv.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastClickTime < 100) { // 100ms debounce
          return;
        }
        lastClickTime = now;
        
        const isMuted = !mutedVoices[fpName];
        mutedVoices[fpName] = isMuted; // update mute state

        // update color based on new mute state
        controlDiv.style.backgroundColor = isMuted ? '#303030' : 'green';

        // dynamically update gain for the corresponding voice with a fade
        const voice_to_play = fpNameToVoiceMap[fpName];
        if (voice_to_play && gainNodes[voice_to_play]) {
          const fadeDuration = 0.02; // 20ms fade duration
          const currentTime = ac.currentTime;

          if (isMuted) {
            // fade out
            gainNodes[voice_to_play].gain.setTargetAtTime(0, currentTime, fadeDuration);
          } else {
            // fade in to the manual gain value
            const targetGain = manualGainValues[fpName] ?? 0.7;
            gainNodes[voice_to_play].gain.setTargetAtTime(targetGain, currentTime, fadeDuration);
          }
        }

        // emit the mute/unmute state to the server for MIDI and OSC
        socket.emit('midiMuteToggle', { fp_name: fpName, muted: isMuted });
      });

      // create a "Stop" button
      const stopButton = document.createElement('button');
      stopButton.className = 'voice-stop-button';
      stopButton.textContent = 'stop';

      // add click handler for the stop button
      stopButton.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent triggering the mute/unmute click event
        
        // track that this voice was recently stopped with a timestamp
        recentlyStoppedVoices.set(fpName, Date.now());
        
        // add to permanently stopped list to prevent regeneration
        permanentlyStoppedVoices.add(fpName);
        
        // immediately remove the UI element
        container.removeChild(wrapperDiv);
        delete mutedVoices[fpName];
        delete manualGainValues[fpName];
        
        // adjust padding-top based on remaining children
        container.style.paddingTop = container.children.length === 0 ? '0px' : '10px';
        
        // send stop command to server
        patternSocket.emit('runCode', { code: `$('${fpName}').stop()`, mode: 'stop' })
      });

      // create gain slider only for audio patterns
      const patternType = patternTypes[fpName];
      let gainSlider = null;
      if (patternType === 'audio') {
        gainSlider = document.createElement('input');
        gainSlider.type = 'range';
        gainSlider.min = '0';
        gainSlider.max = '1';
        gainSlider.step = '0.01';
        gainSlider.value = (manualGainValues[fpName] ?? 0.7).toString();
        gainSlider.className = 'gain-slider';
        gainSlider.title = 'Gain';

        // add event listener for gain changes
        gainSlider.addEventListener('input', (e) => {
          const newGain = parseFloat(e.target.value);
          manualGainValues[fpName] = newGain;

          // apply gain change with smooth ramp if not muted
          const voice_to_play = fpNameToVoiceMap[fpName];
          if (voice_to_play && gainNodes[voice_to_play] && !mutedVoices[fpName]) {
            const currentTime = ac.currentTime;
            const rampDuration = 0.05; // 50ms smooth ramp
            gainNodes[voice_to_play].gain.setTargetAtTime(newGain, currentTime, rampDuration);
          }
        });
      }

      // append the voice-control and stop button to the controls row
      controlsRow.appendChild(controlDiv);
      controlsRow.appendChild(stopButton);
      
      // append the controls row to the wrapper
      wrapperDiv.appendChild(controlsRow);
      
      // append the gain slider to the wrapper if it exists
      if (gainSlider) {
        wrapperDiv.appendChild(gainSlider);
      }
      
      container.appendChild(wrapperDiv);
    }
  });

  // sync existing voices with backend mute states, but prioritize keeping them unmuted for new patterns
  syncMuteStates(fpNames, backendMuteStates);

  // remove voices that are no longer in the data or are permanently stopped
  Array.from(container.children).forEach(child => {
    const voiceControlElement = child.querySelector('.voice-control');
    if (voiceControlElement) {
      const fpName = voiceControlElement.dataset.fpName;
      // Remove if fpNames is empty array, if fpName is not in fpNames, or if permanently stopped
      if (!fpNames || fpNames.length === 0 || !fpNames.includes(fpName) || permanentlyStoppedVoices.has(fpName)) {
        delete mutedVoices[fpName];
        // Only delete manual gain values if permanently stopped, not during regeneration
        if (permanentlyStoppedVoices.has(fpName)) {
          delete manualGainValues[fpName];
        }
        recentlyStoppedVoices.delete(fpName); // clean up tracking when server confirms removal
        container.removeChild(child);
      }
    }
  });
  }

  // adjust padding-top of the container based on the number of children (to be completely hidden with 0 patterns)
  container.style.paddingTop = container.children.length === 0 ? '0px' : '10px';
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

      channels.forEach((channel, index) => {
        const source = ac.createBufferSource();
        source.buffer = voices[actualVoiceToPlay].buffer;

        // create or reuse a gain node for this voice
        if (!gainNodes[actualVoiceToPlay]) {
          gainNodes[actualVoiceToPlay] = ac.createGain();
        }

        // reset gain to baseline (manual gain value for unmuted, 0 for muted)
        const manualGain = manualGainValues[data.fp_name] ?? 0.7;
        gainNodes[actualVoiceToPlay].gain.value = mutedVoices[data.fp_name] ? 0 : manualGain;

        // only connect if not already connected
        if (!sources[actualVoiceToPlay].includes(source)) {
          source.connect(gainNodes[actualVoiceToPlay]);
          gainNodes[actualVoiceToPlay].connect(mergerNodes[actualVoiceToPlay], 0, channel - 1);
        }

        if (pan_data === false || channels.length === 1) {
          // adjust overall gain for single-channel or no pan data
          const manualGain = manualGainValues[data.fp_name] ?? 0.7;
          gainNodes[actualVoiceToPlay].gain.value = mutedVoices[data.fp_name] ? 0 : manualGain;
        } else {
          const durationPerValue = source.buffer.duration / pan_data.length;
          pan_data.forEach((panValue, i) => {
            const time = i * durationPerValue;
            const normalizedIndex = index / (channels.length - 1);
            const manualGain = manualGainValues[data.fp_name] ?? 0.7;
            const gainValue = Math.abs(normalizedIndex - panValue) <= 1 / (channels.length - 1)
              ? manualGain * (1 - Math.abs(normalizedIndex - panValue))
              : 0;
            gainNodes[actualVoiceToPlay].gain.setValueAtTime(
              gainValue * (mutedVoices[data.fp_name] ? 0 : 1),
              ac.currentTime + time
            );
          });
        }

        try {
          source.start();
        } catch (error) {}
        
        sources[actualVoiceToPlay].push(source);
        lastPlayedTimes[actualVoiceToPlay] = Date.now();
      });
    }
  }
});

// delete any sources that haven't been played in the past 1 minute to limit memory usage
setInterval(() => {
  let currentTime = Date.now();
  for (let voice in lastPlayedTimes) {
    if (currentTime - lastPlayedTimes[voice] > 60 * 1000) {
      if (sources[voice]) {
        // Iterate over each source and disconnect it
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

socket.on('load', function (data) {
  // if frontend gate is active, block all audio loading
  if (frontendGateActive) {
    return;
  }

  for (var i = 0; i < data.length; i++) {
    if (browser_sound_output === true) {
      let load_data = data[i].split(' ');
      let voice_number = load_data[0];
      let fp = load_data[1];
      let voice_bpm = Number(load_data[2]);
      
      // track that this voice was requested to load
      requestedVoices.add(Number(voice_number));
      
      const startTime = Date.now();
      const loadKey = `${voice_number}_${fp}`;
      
      pendingLoads.set(loadKey, startTime);
      loadTiming.set(loadKey, { start: startTime, voice_number, fp });
      
      // get any wav files that were just generated
      fetch(`../tmp/${fp}`)
        .then(response => {
          const fetchTime = Date.now() - startTime;
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          const arrayBufferTime = Date.now() - startTime;
          return ac.decodeAudioData(arrayBuffer);
        })
        .then(audioBuffer => {
          const totalTime = Date.now() - startTime;
          
          // add the audioBuffer directly to the voices object
          voices[voice_number] = { buffer: audioBuffer, bpm: voice_bpm };

          // track this voice in pattern history when it's successfully loaded
          // extract pattern name
          const patternName = fp.split('---')[0];
          
          if (patternName) {
            if (!patternVoiceHistory.has(patternName)) {
              patternVoiceHistory.set(patternName, []);
            }
            const voiceHistory = patternVoiceHistory.get(patternName);
            if (!voiceHistory.includes(Number(voice_number))) {
              voiceHistory.push(Number(voice_number));
              // keep only the last 5 voices for each pattern to avoid memory bloat
              if (voiceHistory.length > 5) {
                voiceHistory.shift();
              }
            }
          }
          
          // clean up tracking
          pendingLoads.delete(loadKey);
          loadTiming.delete(loadKey);
        })
        .catch(e => {
          const totalTime = Date.now() - startTime;
          
          // clean up tracking
          pendingLoads.delete(loadKey);
          loadTiming.delete(loadKey);
        });
    }
  }
});

socket.on('transport_cleanup', () => {
  // deactivate frontend gate when transport cleanly shuts down
  frontendGateActive = false;
  
  // clean up voices and related audio objects when transport shuts down
  voices = [];
  sources = [];
  pitchShifts = {};
  lastPlayedTimes = {};
  mutedVoices = {};
  fpNameToVoiceMap = {};
  gainNodes = {};
  manualGainValues = {}; // clear manual gain values
  mergerNodes = {};
  recentlyStoppedVoices.clear(); // clear recently stopped tracking
  permanentlyStoppedVoices.clear(); // clear permanently stopped tracking
  patternVoiceHistory.clear(); // clear pattern voice history for fallback
  
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
      voiceControl.style.backgroundColor = muted ? '#303030' : 'green';
    }
  }
});

// handle requests for current mute states
socket.on('currentMuteStates', (backendMuteStates) => {
  // sync frontend states with backend, but prioritize keeping patterns unmuted
  syncMuteStates(Object.keys(mutedVoices), backendMuteStates);
});