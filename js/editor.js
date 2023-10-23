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

$(document).keydown(function(e) {
  // [ctrl + enter] or [ctrl + r] to select text and send to pattern server (127.0.0.1:1123)
  if ( e.ctrlKey && ( e.keyCode == 13 || e.keyCode == 82 )  ) {
    ac = new AudioContext();
    runFacet();
  }
  else if ( e.ctrlKey && e.keyCode == 188 ) {
    // clear hooks: [ctrl + ","]
    $.post('http://127.0.0.1:1123/hooks/clear', {}).done(function( data, status ) {});
    $.growl.notice({ message: 'hooks cleared' });
  }
  else if ( e.ctrlKey && (e.keyCode == 190 || e.keyCode == 191) ) {
    // clear hooks and mute everything: [ctrl + "."] or  [ctrl + "?"]
    $.post('http://127.0.0.1:1123/stop', {}).done(function( data, status ) {});
    $.growl.notice({ message: 'system muted' });
  }

  // set bpm & unfocus the #bpm input when user hits enter while focused on it
  if ( $('#bpm').is(':focus') && e.keyCode == 13 ) {
    $.post('http://127.0.0.1:3211/bpm', {bpm:$('#bpm').val()}).done(function( data, status ) {}).fail(function(data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
    $('#bpm').blur();
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
    $.post('http://127.0.0.1:1123/autocomplete', {}).done(function( data, status ) {
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

function runFacet() {
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
  $.post('http://127.0.0.1:1123', {code:code}).done(function( data, status ) {
    if ( data.success == true ) {
      $.growl.notice({ message: 'success:<br/>' + code });
    }
    else if ( data.error )  {
      $.growl.error({ message: 'error:<br/>' + data.error });
    }
  });
}

let midi_outs;
$.post('http://127.0.0.1:3211/midi', {}).done(function( data, status ) {
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
  $.post('http://127.0.0.1:3211/midi_select', {output:this.value}).done(function( data, status ) {});
});

$('body').on('click', '#midi_refresh', function() {
  $.post('http://127.0.0.1:3211/midi', {}).done(function( data, status ) {
    $('#midi_outs').html('');
    for (var i = 0; i < data.data.length; i++) {
      let midi_out = data.data[i];
      $('#midi_outs').append('<option value="' + midi_out + '">' + midi_out + '</option>');
    }
    $.growl.notice({ message: 'MIDI outputs refreshed' });
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
  $.post('http://127.0.0.1:1123/stop', {}).done(function( data, status ) {
    $.growl.notice({ message: 'system muted' });
  })
  .fail(function(data) {
    if ( data.statusText == 'error' ) {
      $.growl.error({ message: 'no connection to the Facet server' });
    }
  });
});

$('body').on('click', '#clear', function() {
  $.post('http://127.0.0.1:1123/hooks/clear', {}).done(function( data, status ) {
    $.growl.notice({ message: 'hooks cleared' });
  });
});

$('body').on('click', '#rerun', function() {
 runFacet();
});

$('body').on('click', '#restart', function() {
  $.post('http://127.0.0.1:5831/restart', {}).done(function( data, status ) {
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
  $.post('http://127.0.0.1:3211/browser_sound', {browser_sound_output:browser_sound_output}).done(function( data, status ) {});
}

function initializeMIDISelection () {
  // retrieve the previously stored MIDI out destination from localstorage
  var storedValue = localStorage.getItem('midi_outs_value');
  if (storedValue) {
    // reset the most recently used MIDI out destination
    $('#midi_outs').val(storedValue);
    $.post('http://127.0.0.1:3211/midi_select', {output:storedValue}).done(function( data, status ) {});
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
});

// begin loop to check status of servers
checkStatus();

function checkStatus() {
  setInterval( () => {
    $.post('http://127.0.0.1:1123/status', {
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

function upscaleArray(data, newLength) {
  let factor = Math.floor(newLength / data.length);
  let newData = [];
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < factor; j++) {
      newData.push(data[i]);
    }
  }
  return newData;
}

let bpm=90;
// check every 10ms for bpm change and send if changed
setInterval(()=>{
  prev_bpm = bpm;
  bpm = $('#bpm').val();
  // send change on increment/decrement by 1
  if ( !isNaN(bpm) && bpm >= 1 && ( Math.abs(bpm-prev_bpm) == 1 ) ) {
    $.post('http://127.0.0.1:3211/bpm', {bpm:bpm}).done(function( data, status ) {}).fail(function(data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }
}, 10);

setInterval(() => {
  fetch('http://localhost:3211/load')
  .then(response => response.json())
  .then((data) => {
    for (var i = 0; i < data.length; i++) {
      if ( browser_sound_output === true ) {
        let load_data = data[i].split(' ');
        let voice_number = load_data[0];
        let fp = load_data[1].split(',');
        let sample_rate = load_data[2];
        let pan_data = load_data[3].split(',');;
        let is_mono = load_data[4] == 1 ? true : false;
        let voice_bpm = Number(load_data[5]);
        fp = fp.map(Number);
        if (is_mono) {
          // if mono, create a single mono buffer
          let buffer = ac.createBuffer(1, fp.length, sample_rate);
          let data = buffer.getChannelData(0);
          for (let i = 0; i < fp.length; i++) {
            data[i] = fp[i];
          }
          voices[voice_number] = {buffer: buffer, bpm: voice_bpm};
        } else {
          // if stereo, create two identical buffers from fp and apply amplitude modulation
          let leftBuffer = ac.createBuffer(1, fp.length, sample_rate);
          let rightBuffer = ac.createBuffer(1, fp.length, sample_rate);
          
          for (let i = 0; i < fp.length; i++) {
            // apply amplitude modulation based on pan_data
            let panIndex = Math.floor(i * pan_data.length / fp.length);
            let panValue = parseFloat(pan_data[panIndex]);
            leftBuffer.getChannelData(0)[i] = fp[i] * (panValue < 0 ? 1 : 1 - panValue);
            rightBuffer.getChannelData(0)[i] = fp[i] * (panValue > 0 ? 1 : 1 + panValue);
          }
    
          // combine the two mono buffers into a stereo buffer
          let stereoBuffer = ac.createBuffer(2, fp.length, sample_rate);
          stereoBuffer.copyToChannel(leftBuffer.getChannelData(0), 0);
          stereoBuffer.copyToChannel(rightBuffer.getChannelData(0), 1);
    
          voices[voice_number] = {buffer: stereoBuffer, bpm: voice_bpm};
        }
      }
    }
  }
  )
  .catch((error) => console.error('Error:', error));
}, 125);

$('#bpm').val(90);

const osc = new OSC({ plugin: new OSC.WebsocketClientPlugin() });
osc.open();

osc.on('/progress', message => {
  $('#progress_bar').width(`${Math.round(message.args[0]*100)}%`);
});

osc.on('/bpm', message => {
  if ( !$('#bpm').is(':focus') && bpmCanBeUpdatedByServer === true ) {
    $('#bpm').val(`${message.args[0]}`);
  }
  if ( browser_sound_output === true ) {
    // adjust the playback speed of all voices
    for (let i = 1; i <= 16; i++) {
      if (voices[i] && sources[i]) {
          let current_bpm = $('#bpm').val();
          let voice_bpm = voices[i].bpm;
          // set the playback rate based on the current and original BPM
          sources[i].playbackRate.value = current_bpm / voice_bpm;
      }
    }
  }
});

let voices = [];
let sources = [];
let ac;

osc.on('/play', message => {
  if ( browser_sound_output === true ) {
    let voice_to_play = message.args[0];
    // check if the voice is loaded
    if (voices[voice_to_play]) {
      let source = ac.createBufferSource();
      source.buffer = voices[voice_to_play].buffer;
      let current_bpm = $('#bpm').val();
      source.playbackRate.value = current_bpm / voices[voice_to_play].bpm;
      source.connect(ac.destination);
      source.start();
      sources[voice_to_play] = source;
    } else {
      // voice is not loaded yet
    }
  }
});

setInterval(() => {
  if ( osc.status() == 3 ) {
    osc.open();
  }
}, 250);

// close down osc server when window shuts down or tab is closed
window.addEventListener("beforeunload", function (e) {
  osc.close();
});

// attempt to restart osc server when tab is focused
window.onfocus = function() {
  osc.open();
};
