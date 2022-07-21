const fs = require('fs');
const sound = require('./lib/play_sound.js');
const easymidi = require('easymidi');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const axios = require('axios');
const FacetPattern = require('./FacetPattern.js');
const shared = require('./shared.js');
let cycles_elapsed = 0;
let current_step = 1;
let midioutput = new easymidi.Output(easymidi.getOutputs()[0]);
let bpm = 90;
let steps = 16;
let step_speed_ms = ((60000 / bpm) / steps) * 4;
let step_speed_copy = step_speed_ms;
let running_transport = setInterval(tick, step_speed_ms);
setInterval(handleBpmChange,100);
let transport_on = true;
let hooks_muted = false;
let hooks = shared.getHooks();
let facet_patterns = shared.getPatterns();

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

app.post('/midi', (req, res) => {
  res.send({
    data:easymidi.getOutputs()
  });
});

app.get('/update', (req, res) => {
  hooks = shared.getHooks();
  facet_patterns = shared.getPatterns();
  res.sendStatus(200);
});

app.post('/midi_select', (req, res) => {
  try {
    midioutput = new easymidi.Output(req.body.output);
    res.sendStatus(200);
  } catch (e) {
    res.send({
      status: 400,
      error: e
    });
  }
});

app.post('/bpm', (req, res) => {
  bpm = Math.abs(Number(req.body.bpm));
  res.sendStatus(200);
});

app.post('/steps', (req, res) => {
  steps = Math.abs(Number(req.body.steps));
  res.sendStatus(200);
});

app.post('/play', (req, res) => {
  transport_on = true;
  res.sendStatus(200);
});

app.post('/mute', (req, res) => {
  facet_patterns = {};
  fs.writeFile('js/patterns.json', '{}',()=> {axios.get('http://localhost:1123/update');});
  transport_on = false;
  res.sendStatus(200);
});

// mute all hooks request via ctrl+f in the browser
app.post('/hooks/mute', (req, res) => {
  if ( hooks_muted == true ) {
    hooks_muted = false;
  }
  else {
    hooks_muted = true;
  }
  res.send({
    muted: hooks_muted
  });
});

// clear all hooks request via ctrl+c in the browser
app.post('/hooks/clear', (req, res) => {
  hooks = {};
  res.send({
    cleared: true
  });
});

const server = app.listen(3211);

function tick() {
  if ( transport_on !== false) {
    // main stepping loop
    let prev_step = current_step-1;
    for (const [hook_key, hook] of Object.entries(hooks)) {
        if ( (Number(hook_key) >= ((prev_step) / steps) && Number(hook_key) < ((current_step) / steps))
          &&  hooks_muted == false ) {
          hook.forEach(h => {
            // only run hook when cycles_elapsed % every == 0
            if ( cycles_elapsed % h.every == 0 ) {
              // re-send the command to the server
              axios.get(`http://localhost:1123/rerun`, {params:{hook:h.command}})
            }
        });
      }
    }
    // begin looping through all facet patterns, looking for wavs/notes/CCs to play
    for (const [k, fp] of Object.entries(facet_patterns)) {
      for (var j = 0; j < fp.sequence_data.length; j++) {
        // sequence data is from 0-1 so it gets scaled into the step range at run time.
        let sequence_step = Math.round(fp.sequence_data[j] * (steps)) + 1;
        if (current_step == sequence_step) {
          try {
            sound.play(`tmp/${fp.name}-out.wav`,1);
            if ( fp.sequence_data.length == 1 && fp.looped === false ) {
              delete facet_patterns[k];
              fs.writeFile('js/patterns.json', JSON.stringify(facet_patterns),()=> {axios.get('http://localhost:1123/update')});
            }
          } catch (e) {}
        }
      }
      // MIDI note logic
      let prev_velocity, prev_duration;
      for (var j = 0; j < fp.notes.length; j++) {
        let note = fp.notes[j];
        if (!note) { continue; }
        let note_fp = scaleNotePatternToSteps(note.data,steps);
        for (var i = 0; i < note_fp.data.length; i++) {
          if ( current_step == i+1 ) {
            if ( note_fp.data[i] == 'skip' || isNaN(note_fp.data[i])) {
              continue;
            }
            let velocity_fp, duration_fp;
            velocity_fp = scalePatternToSteps(note.velocity.data,steps);
            duration_fp = scalePatternToSteps(note.duration.data,steps);
            // generate MIDI note on/off pair for this step
            let n = note_fp.data[i];
            let v = velocity_fp.data[i];
            let d = duration_fp.data[i];
            let c = note.channel;
            try {
              if ( typeof midioutput !== 'undefined' ) {
                midioutput.send('noteon', {
                  note:n,
                  velocity:v,
                  channel:c
                });
              }
              setTimeout(() => {
                noteoff(n,c);
              },d);
            } catch (e) {
              throw e
            }
            // remove the note sequence once it's done playing
            if ( i + 1 == note_fp.data.length ) {
              delete facet_patterns[k];
              fs.writeFile('js/patterns.json', JSON.stringify(facet_patterns),()=> {axios.get('http://localhost:1123/update')});
            }
          }
        }
      }

      // MIDI CC logic
      for (var j = 0; j < fp.cc_data.length; j++) {
        let cc = fp.cc_data[j];
        // convert cc steps to positions based on global step resolution
        let cc_fp = scalePatternToSteps(cc.data,steps);
        for (var i = 0; i < cc_fp.data.length; i++) {
          if ( current_step == i+1 ) {
            let value = cc_fp.data[i];
            if ( typeof midioutput !== 'undefined' ) {
              midioutput.send('cc', {
                controller: cc.controller,
                value: value,
                channel: cc.channel
              });
            }
          }
          // remove the cc sequence once it's done playing
          if ( j + 1 == cc_fp.data.length ) {
            delete facet_patterns[k];
            fs.writeFile('js/patterns.json', JSON.stringify(facet_patterns),()=> {axios.get('http://localhost:1123/update')});
          }
        }
      }

      // MIDI pitchbend logic
      for (var j = 0; j < fp.pitchbend_data.length; j++) {
        let pb = fp.pitchbend_data[j];
        // convert cc steps to positions based on global step resolution
        let pb_fp = scalePatternToSteps(pb.data,steps);
        for (var i = 0; i < pb_fp.data.length; i++) {
          if ( current_step == i+1 ) {
            let value = pb_fp.data[i];
            if ( typeof midioutput !== 'undefined' ) {
              midioutput.send('pitch', {
                value:value,
                channel:pb.channel
              });
            }
          }
          // remove the cc sequence once it's done playing
          if ( j + 1 == pb_fp.data.length ) {
            delete facet_patterns[k];
            fs.writeFile('js/patterns.json', JSON.stringify(facet_patterns),()=> {axios.get('http://localhost:1123/update')});
          }
        }
      }
    }
    if ( current_step >= steps ) {
      current_step = 1;
      cycles_elapsed++;
    }
    else {
      current_step++;
    }

    if ( current_step == 2 || steps == 1 ) {
      for (const [k, fp] of Object.entries(facet_patterns)) {
        if ( fp.sequence_data.length > 1 && fp.looped === false ) {
          // delete sequences set via .play() instead of .repeat(), at the end of one cycle
          delete facet_patterns[k];
          fs.writeFile('js/patterns.json', JSON.stringify(facet_patterns),()=> {axios.get('http://localhost:1123/update')});
        }
      }
    }
  }
}

function handleBpmChange() {
  step_speed_ms = ((60000 / bpm) / steps) * 4;
  if ( step_speed_copy != step_speed_ms ) {
   clearInterval(running_transport);
   step_speed_copy = step_speed_ms;
   running_transport = setInterval(tick, step_speed_ms);
  }
}

function noteoff(note,channel) {
  if ( typeof midioutput !== 'undefined' ) {
    midioutput.send('noteoff', {
      note: note,
      velocity: 0,
      channel: channel
    });
  }
}

function scalePatternToSteps(pattern,steps) {
  let fp = new FacetPattern();
  // scale note pattern onto a bar of length _steps_.
  if (pattern.length < steps ) {
    let upscaled_data = [];
    let copies_of_each_value = Math.floor(steps/pattern.length) + 1;
    for (var n = 0; n < pattern.length; n++) {
      let i = 0;
      while (i < copies_of_each_value) {
        upscaled_data.push(pattern[n]);
        i++;
      }
    }
    fp.from(upscaled_data).reduce(steps);
  }
  else {
    // downscale
    fp.from(pattern).reduce(steps);
  }
  return fp;
}

function scaleNotePatternToSteps(pattern,steps) {
  let fp = new FacetPattern();
  // scale note pattern onto a bar of length _steps_.
  if (pattern.length < steps ) {
    // upscale
    let upscaled_data = new Array(steps).fill('skip');
    for (var n = 0; n < pattern.length; n++) {
      let relative_index = n/(pattern.length-1);
      if (isNaN(relative_index)) {
        relative_index = 0;
      }
      upscaled_data[Math.floor(relative_index * steps)] = pattern[n];
    }
    fp.from(upscaled_data).reduce(steps);
  }
  else {
    // downscale
    fp.from(pattern).reduce(steps);
  }
  return fp;
}
