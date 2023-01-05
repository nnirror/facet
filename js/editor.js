var cm = CodeMirror(document.body, {
  value: ``,
  mode:  "javascript",
  theme: "mbo",
  lineWrapping: true
});

let mousex = 1, mousey = 1;
onmousemove = function(e) {
  mousex = e.clientX/window.innerWidth;
  mousey = Math.abs(1-(e.clientY/window.innerHeight));
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
    $.post('http://127.0.0.1:3211/play', {}).done(function( data, status ) {})
    runFacet();
  }
  else if ( e.ctrlKey && e.keyCode == 67 ) {
    // clear hooks: ctrl+c
    $.post('http://127.0.0.1:1123/hooks/clear', {}).done(function( data, status ) {});
    $.growl.notice({ message: 'hooks cleared' });
  }
  else if ( e.ctrlKey && e.keyCode == 77 ) {
    // clear hooks and mute everything: ctrl+m
    $.post('http://127.0.0.1:1123/stop', {}).done(function( data, status ) {});
    $.post('http://127.0.0.1:3211/stop', {}).done(function( data, status ) {});
    $.growl.notice({ message: 'system muted' });
  }

  // set bpm & unfocus the #bpm input when user hits enter while focused on it
  if ( $('#bpm').is(':focus') && e.keyCode == 13 ) {
    $.post('http://127.0.0.1:3211/bpm', {bpm:$('#bpm').val()}).done(function( data, status ) {}).fail(function(data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
    $('#bpm').blur();
  }

  // set steps & unfocus the the #steps input when user hits enter while focused on it
  if ( $('#steps').is(':focus') && e.keyCode == 13 ) {
    $.post('http://127.0.0.1:3211/steps', {steps:Math.round($('#steps').val())}).done(function( data, status ) {}).fail(function(data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
    $('#steps').blur();
  }
});

function runFacet() {
  // select the entire block surrounding the cursor pos, based on if
  // newlines exist above and below
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
  let commands = code.trim().split(';').filter(Boolean);
  $.post('http://127.0.0.1:1123', {code:code}).done(function( data, status ) {
    if ( data.success == true ) {
      // load wav file and play it.
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

$('body').on('click', '#play', function() {
  $.post('http://127.0.0.1:3211/play', {}).done(function( data, status ) {})
  .fail(function(data) {
    if ( data.statusText == 'error' ) {
      $.growl.error({ message: 'no connection to the Facet server' });
    }
  });
});

$('body').on('click', '#stop', function() {
  $.post('http://127.0.0.1:3211/stop', {}).done(function( data, status ) {})
  .fail(function(data) {
    if ( data.statusText == 'error' ) {
      $.growl.error({ message: 'no connection to the Facet server' });
    }
  });
  $.post('http://127.0.0.1:1123/stop', {}).done(function( data, status ) {})
  .fail(function(data) {
    if ( data.statusText == 'error' ) {
      $.growl.error({ message: 'no connection to the Facet server' });
    }
  });
});

$('body').on('click', '#clear', function() {
  $.post('http://127.0.0.1:1123/hooks/clear', {}).done(function( data, status ) {});
});

$('body').on('click', '#rerun', function() {
 $.post('http://127.0.0.1:3211/play', {}).done(function( data, status ) {})
 runFacet();
});

// begin OSC
const osc = new OSC({ plugin: new OSC.WebsocketClientPlugin() });
osc.open();
checkStatus();

osc.on('/cpu', message => {
  let cpu_percent = parseFloat(message.args[0]).toFixed(2).substring(0,4);
  $('#cpu').html(cpu_percent + '%&nbsp;cpu');
});

osc.on('/errors', message => {
  $.growl.error({ message: message.args[0] });
});

function checkStatus() {
  let connected = false;
  let interval = setInterval( () => {
    $.post('http://127.0.0.1:3211/status', {
      mousex:mousex,
      mousey:mousey
    }).done(function( data, status ) {
      setStatus(`connected`);
    })
    .fail(function(data) {
      setStatus(`disconnected`);
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
// end OSC

let bpm=90;
let steps=16;
// check every 10ms for bpm change and send if changed
setInterval(function () {
  prev_bpm = bpm;
  bpm = $('#bpm').val();
  // send change on increment/decrement by 1
  if ( !isNaN(bpm) && bpm >= 1 && ( Math.abs(bpm-prev_bpm) == 1 ) ) {
    $.post('http://127.0.0.1:3211/bpm', {bpm:bpm}).done(function( data, status ) {}).fail(function(data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }

  prev_steps = steps;
  steps = $('#steps').val();
  if ( !isNaN(steps) && steps >= 1 && ( Math.abs(steps-prev_steps) == 1 ) ) {
    $.post('http://127.0.0.1:3211/steps', {steps:Math.round(steps)}).done(function( data, status ) {}).fail(function(data) {
      $.growl.error({ message: 'no connection to the Facet server' });
    });
  }
}, 10);

$('#bpm').val(90);
$('#steps').val(16);