var cm = CodeMirror(document.body, {
  value: ``,
  mode:  "javascript",
  theme: "mbo",
  lineWrapping: true,
  matchBrackets: true,
  lint: {options: {esversion: 2021, asi: true}}
});

var facet_methods  =  [];

let mousex = 1, mousey = 1;
onmousemove = function(e) {
  mousex = e.clientX/window.innerWidth;
  mousey = Math.abs(1-(e.clientY/window.innerHeight));
}

try {
  let facet_history = localStorage.getItem('facet_history');
  if ( facet_history ) {
    cm.setValue(facet_history);
  }
}
catch (e) {
  // do nothing because there's nothing saved in localStorage
}

function getFirstLineOfBlock(initial_line) {
  // true if line above is empty or the line number gets to 0
  let above_line_is_empty = false;
  let current_line_number = initial_line;
  let first_line;
  while ( above_line_is_empty == false && current_line_number >= 0 ) {
    // check previous line for conditions that would indicate first line
    // of block; otherwise continue decrementing line number
    if ( (current_line_number ) == 0 ) {
      first_line = 0;
      break;
    }
    let line_above = cm.getLine(current_line_number - 1);
    if ( line_above.trim() == '' ) {
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
  while ( below_line_is_empty == false ) {
    if ( (current_line_number + 1) == cm.lineCount() ) {
      last_line = current_line_number;
      break;
    }
    // check below line for conditions that would indicate last line
    // of block; otherwise continue incrementing line number
    let line_below = cm.getLine(current_line_number + 1);
    if ( line_below.trim() == '' ) {
      below_line_is_empty = true;
      last_line = current_line_number;
    }
    current_line_number++;
  }
  return last_line;
}

// prevent accidental refreshes which would lose unsaved changes
window.onbeforeunload = function() {
  return "Are you sure you want to leave? Unsaved changes will be lost.";
};

$(document).keydown(function(e) {
  // [ctrl + enter] or [ctrl + r] to select text and send to pattern server :1123
  if ( e.ctrlKey && ( e.keyCode == 13 || e.keyCode == 82 )  ) {
    runFacet();
  }
  else if ( e.ctrlKey && e.keyCode == 188 ) {
    // clear hooks: [ctrl + ","]
    $.post(`http://${configSettings.HOST}:1123/hooks/clear`, {}).done(function( data, status ) {});
    $.growl.notice({ message: 'regeneration stopped' });
  }
  else if ( e.ctrlKey && (e.keyCode == 190 || e.keyCode == 191) ) {
    // clear hooks and mute everything: [ctrl + "."] or  [ctrl + "?"]
    $.post(`http://${configSettings.HOST}:1123/stop`, {}).done(function( data, status ) {});
    $.growl.notice({ message: 'system muted' });
  }
  else if ( e.ctrlKey && (e.keyCode == 222 ) ) {
    // stop command(s)
    runFacet('stop');
    $.growl.notice({ message: 'command(s) stopped' });
  }
  else if ( e.ctrlKey && (e.keyCode == 186 || e.keyCode == 59 ) ) {
    // keep command(s)
    runFacet('keep');
    $.growl.notice({ message: 'command(s) generated and kept' });
  }
  else if ( e.ctrlKey && (e.keyCode == 220 ) ) {
    // command(s) run once
    runFacet('once');
    $.growl.notice({ message: 'command(s) generated to play once' });
  }

  // set bpm & unfocus the #bpm input when user hits enter while focused on it
  if ( $('#bpm').is(':focus') && e.keyCode == 13 ) {
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
    $('#bpm').blur();
  }

  if ( $('#time_signature_numerator').is(':focus') && e.keyCode == 13 ) {
    $('#time_signature_numerator').blur();
  }
  if ( $('#time_signature_denominator').is(':focus') && e.keyCode == 13 ) {
    $('#time_signature_denominator').blur();
  }

  if ( e.ctrlKey && e.keyCode === 70 ) {
    var cursor = cm.getCursor();
    var currentLine = cursor.line;
    let scroll_info = cm.getScrollInfo();
    cm.setValue(js_beautify(cm.getValue(), {
      indent_size: 2,
      break_chained_methods: true
    }))
    cm.focus();
    cm.setCursor({
      line: currentLine-1
    });
    cm.scrollTo(scroll_info.left,scroll_info.top);
  }

  if ( e.ctrlKey && e.code === 'Space' ) {
    $.post(`http://${configSettings.HOST}:1123/autocomplete`, {}).done(function( data, status ) {
      facet_methods = data.data.methods;
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
    }).fail(function(data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }

});

$(document).keyup(function(e) {
  // save the entire text block in localstorage
  localStorage.setItem('facet_history', cm.getValue());
});

function runFacet(mode = 'run') {
  // select the entire block surrounding the cursor pos, based on if newlines exist above and below
  let cursor = cm.getCursor();
  let line = cursor.line;
  let first_line_of_block = getFirstLineOfBlock(line);
  let last_line_of_block = getLastLineOfBlock(line);
  // highlight the text that will run for 100ms
  cm.setSelection({line: first_line_of_block, ch: 0 }, {line: last_line_of_block, ch: 10000 });
  // de-highlight, set back to initial cursor position
  setTimeout(function(){ cm.setCursor({line: line, ch: cursor.ch }); }, 100);
  setStatus(`processing`);
  let code = cm.getSelection();
  $.post(`http://${configSettings.HOST}:1123`, {code:code,mode:mode});
}

let midi_outs;
$.post(`http://${configSettings.HOST}:3211/midi`, {}).done(function( data, status ) {
  // create <select> dropdown with this -- check every 2 seconds, store
  // in memory, if changed update select #midi_outs add option
  if (data.data != midi_outs) {
    midi_outs = data.data;
    $('#midi_outs').append('<option value="">-- MIDI output --</option>');
    for (var i = 0; i < midi_outs.length; i++) {
      let midi_out = midi_outs[i];
      $('#midi_outs').append('<option value="' + midi_out + '">' + midi_out + '</option>');
    }
  }
});

$('body').on('change', '#midi_outs', function() {
  localStorage.setItem('midi_outs_value', this.value);
  $.post(`http://${configSettings.HOST}:3211/midi_select`, {output:this.value}).done(function( data, status ) {});
});

$('body').on('click', '#midi_refresh', function() {
  $.post(`http://${configSettings.HOST}:3211/midi`, {}).done(function( data, status ) {
    $('#midi_outs').html('');
    for (var i = 0; i < data.data.length; i++) {
      let midi_out = data.data[i];
      $('#midi_outs').append('<option value="' + midi_out + '">' + midi_out + '</option>');
    }
  })
  .fail(function(data) {
    if ( data.statusText == 'error' ) {
      $.growl.error({ message: 'no connection to the Facet server' });
    }
  });
});

$('body').on('click', '#sound', function() {
  if ( localStorage.getItem('facet_browser_sound_output') === 'true' ) {
    localStorage.setItem('facet_browser_sound_output', 'false');
    $.growl.notice({ message: 'browser sound is off.' });
    setBrowserSound('false');
  }
  else if ( localStorage.getItem('facet_browser_sound_output') === 'false' ) {
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

$('body').on('click', '#stop', function() {
  $.post(`http://${configSettings.HOST}:1123/stop`, {}).done(function( data, status ) {
    $.growl.notice({ message: 'system muted' });
  })
  .fail(function(data) {
    if ( data.statusText == 'error' ) {
      $.growl.error({ message: 'no connection to the Facet server' });
    }
  });
});

$('body').on('click', '#clear', function() {
  $.post(`http://${configSettings.HOST}:1123/hooks/clear`, {}).done(function( data, status ) {
    $.growl.notice({ message: 'regeneration stopped' });
  });
});

$('body').on('click', '#rerun', function() {
 runFacet();
});

$('body').on('click', '#restart', function() {
  $.post(`http://${configSettings.HOST}:5831/restart`, {}).done(function( data, status ) {
    if (status == 'success') {
      $.growl.notice({ message: 'Facet restarted successfully'});
    }
    else {
      $.growl.error({ message: 'There was an error while restarting Facet'});
    }
  });
});

let browser_sound_output = true;

$(document).ready(function() {
  $('#midi_refresh').click();
  setTimeout(() => {
    initializeMIDISelection();
}, 100);
try {
  setBrowserSound(localStorage.getItem('facet_browser_sound_output'));
}
catch (e) {
  // do nothing because there's nothing saved in localStorage
}
});

setInterval(() => {
  initializeMIDISelection();
}, 1000);

function setBrowserSound(true_or_false_local_storage_string) {
  if ( true_or_false_local_storage_string === 'true' ) {
    browser_sound_output = true;
    $('#sound').css('background',"url('../spkr.png') no-repeat");
    $('#sound').css('background-size',"100% 200%");
  }
  else if ( true_or_false_local_storage_string === 'false' ) {
    browser_sound_output = false;
    $('#sound').css('background',"url('../spkr-off.png') no-repeat");
    $('#sound').css('background-size',"100% 200%");
  }
  else {
    browser_sound_output = true;
    $('#sound').css('background',"url('../spkr.png') no-repeat");
    $('#sound').css('background-size',"100% 200%");
  }
  $.post(`http://${configSettings.HOST}:3211/browser_sound`, {browser_sound_output:browser_sound_output}).done(function( data, status ) {});
}

function initializeMIDISelection () {
  // retrieve the previously stored MIDI out destination from localstorage
  var storedValue = localStorage.getItem('midi_outs_value');
  if (storedValue) {
    // reset the most recently used MIDI out destination
    $('#midi_outs').val(storedValue);
    $.post(`http://${configSettings.HOST}:3211/midi_select`, {output:storedValue}).done(function( data, status ) {});
  }
}

// adjust playback rates of audio files
function adjustPlaybackRates(currentBpm) {
  if (browser_sound_output === true) {
    for (let i = 1; i <= voices.length; i++) {
      if (voices[i] && sources[i]) {
        let voiceBpm = voices[i].bpm;
        let pitch = pitchShifts[i];
        sources[i].forEach(source => {
          source.playbackRate.value = (currentBpm / voiceBpm) * pitch;
        });
      }
    }
  }
}

let blockBpmUpdateFromServer;
let bpmCanBeUpdatedByServer = true;
$('body').on('change', '#bpm', function() {
    bpmCanBeUpdatedByServer = false;
    clearTimeout(blockBpmUpdateFromServer);
    blockBpmUpdateFromServer = setTimeout(function() {
      bpmCanBeUpdatedByServer = true;
    }, 3000);
    let currentBpm = $(this).val();
    if (!isNaN(currentBpm) && currentBpm >= 1) {
      adjustPlaybackRates(currentBpm);
    }
});

$('body').on('blur', '#time_signature_numerator', ()=>{
  let user_input_time_signature_numerator = $('#time_signature_numerator').val();
  if (!isNaN(user_input_time_signature_numerator) && Math.abs(user_input_time_signature_numerator) >= 1) {
    time_signature_numerator = user_input_time_signature_numerator;
    $.post(`http://${configSettings.HOST}:3211/bpm`, { bpm: bpm, time_signature_numerator: time_signature_numerator, time_signature_denominator: time_signature_denominator }).done(function (data, status) { }).fail(function (data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }
});

$('body').on('blur', '#time_signature_denominator', ()=>{
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
  setInterval( () => {
    $.post(`http://${configSettings.HOST}:1123/status`, {
      mousex:mousex,
      mousey:mousey
    }).done(function( data, status ) {
      Object.values(data.data.errors).forEach(error => {
        $.growl.error({ message: error });
      });
      let cpu_percent = Math.round(parseFloat(data.data.cpu).toFixed(2) * 100);
      cpu_percent = cpu_percent.toString().substring(0,4);
      $('#cpu').html(`${cpu_percent}%&nbsp;cpu`);
      setStatus(`connected`);
    })
    .fail(function(data) {
      setStatus(`disconnected`);
      $('#cpu').html(`[offline]`);
    });
  }, 250);
}

function setStatus(status) {
  let colored_span = '';
  if ( status == 'connected' ) {
    colored_span = `<span style="color:green;"">●</span>`;
  }
  else if ( status == 'processing' ) {
    colored_span = `<span style="color:green;"">●</span>`;
  }
  else if ( status == 'disconnected' ) {
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
ac = new AudioContext();
ac.destination.channelCount = ac.destination.maxChannelCount;
ac.destination.channelCountMode = "explicit";
ac.destination.channelInterpretation = "discrete";

// create limiter for main output
let compressor = ac.createDynamicsCompressor();
compressor.threshold.setValueAtTime(-1, ac.currentTime);
compressor.knee.setValueAtTime(0, ac.currentTime);
compressor.ratio.setValueAtTime(20, ac.currentTime);
compressor.attack.setValueAtTime(0, ac.currentTime);
compressor.release.setValueAtTime(0.1, ac.currentTime);
compressor.connect(ac.destination);

// connect to the server
const socket = io.connect(`http://${configSettings.HOST}:3000`, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

socket.on('progress', (progress) => {
  $('#progress_bar').width(`${Math.round(progress*100)}%`);
})

socket.on('time_signature_numerator', (numerator) => {
  if ( !$('#time_signature_numerator').is(':focus') && prev_time_signature_numerator !== numerator ) {
    $('#time_signature_numerator').val(`${numerator}`);
  }
})

socket.on('time_signature_denominator', (denominator) => {
  if ( !$('#time_signature_denominator').is(':focus') && prev_time_signature_denominator !== denominator ) {
    $('#time_signature_denominator').val(`${denominator}`);
  }
})

socket.on('bpm', (bpm) => {
  if (!$('#bpm').is(':focus') && bpmCanBeUpdatedByServer === true) {
    $('#bpm').val(`${bpm}`);
  }
  adjustPlaybackRates($('#bpm').val());
});

socket.on('play', (data) => {
  let voice_to_play = data.voice;
  let pitch = data.pitch;
  let channels = data.channels;
  let pan_data = data.pan_data;
  pitchShifts[voice_to_play] = pitch;
  if ( browser_sound_output === true ) {
    // check if the voice is loaded
    if (voices[voice_to_play]) {
      let merger = ac.createChannelMerger(ac.destination.channelCount);
      sources[voice_to_play] = [];
      channels.forEach((channel, index) => {
        let source = ac.createBufferSource();
        source.buffer = voices[voice_to_play].buffer;
        let current_bpm = $('#bpm').val();
        source.playbackRate.value = (current_bpm / voices[voice_to_play].bpm) * pitch;
        // create a gain node for each channel
        let gainNode = ac.createGain();
        source.connect(gainNode);
        gainNode.connect(merger, 0, channel - 1);
        
        if (pan_data === false || channels.length === 1) {
          // if pan_data is false or there is only one channel, set the gain value to 1 for all channels
          gainNode.gain.value = 0.7;
        } else {
          // schedule changes in the gain value based on pan_data
          let durationPerValue = source.buffer.duration / pan_data.length;
          pan_data.forEach((panValue, i) => {
            let time = i * durationPerValue;
            // calculate the normalized channel index
            let normalizedIndex = index / (channels.length - 1);
            // only interpolate the gain for the two channels closest to the pan_data value - otherwise, gain = 0
            let gainValue = Math.abs(normalizedIndex - panValue) <= 1 / (channels.length - 1) ? 0.7 * (1 - Math.abs(normalizedIndex - panValue)) : 0;
            gainNode.gain.setValueAtTime(gainValue, ac.currentTime + time);
          });
        }

        source.start();
        sources[voice_to_play].push(source);
        lastPlayedTimes[voice_to_play] = Date.now();
      });
      merger.connect(compressor);
    } else {
      // voice is not loaded yet
    }
  }
});

// delete any sources that haven't been played in the past 1 minute to limit memory usage
setInterval(() => {
  let currentTime = Date.now();
  for (let voice in lastPlayedTimes) {
    if (currentTime - lastPlayedTimes[voice] > 60 * 1000) {
      sources[voice].disconnect();
      delete sources[voice];
      delete lastPlayedTimes[voice];
    }
  }
}, 60 * 5000);

socket.on('load', function(data) {
  for (var i = 0; i < data.length; i++) {
    if ( browser_sound_output === true ) {
      let load_data = data[i].split(' ');
      let voice_number = load_data[0];
      let fp = load_data[1];
      let voice_bpm = Number(load_data[2]);
      // get any wav files that were just generated
      fetch(`../tmp/${fp}`)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => ac.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        // add the audioBuffer directly to the voices object
        voices[voice_number] = {buffer: audioBuffer, bpm: voice_bpm};
      })
      .catch(e => console.error(e));
    }
  }
});