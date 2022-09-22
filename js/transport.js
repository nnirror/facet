const fs = require('fs');
const sound = require('./lib/play_sound.js');
const easymidi = require('easymidi');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const axios = require('axios');
const FacetPattern = require('./FacetPattern.js');
let cycles_elapsed = 0;
let current_step = 1;
let midioutput = new easymidi.Output(easymidi.getOutputs()[0]);
let bpm = 90;
let steps = 16;
let step_speed_ms = ((60000 / bpm) / steps) * 4;
let step_speed_copy = step_speed_ms;
let running_transport = setInterval(tick, step_speed_ms);
let transport_on = true;
let facet_patterns = {};

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(bodyParser.json({limit: '100mb'}));
app.use(cors());

app.post('/midi', (req, res) => {
  res.send({
    data:easymidi.getOutputs()
  });
});

app.post('/update', (req, res) => {
  let posted_pattern = JSON.parse(req.body.pattern);
  facet_patterns[posted_pattern.name] = posted_pattern;
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

app.post('/play', (req, res) => {
  transport_on = true;
  res.sendStatus(200);
});

app.post('/steps', (req, res) => {
  steps = Math.abs(Number(req.body.steps));
  res.sendStatus(200);
});

app.post('/stop', (req, res) => {
  transport_on = false;
  facet_patterns = {};
  res.sendStatus(200);
});

const server = app.listen(3211);

function tick() {
  if ( transport_on !== false) {
    // main stepping loop
    let prev_step = current_step-1;
    // begin looping through all facet patterns, looking for wavs/notes/CCs to play
    for (const [k, fp] of Object.entries(facet_patterns)) {
      for (var j = 0; j < fp.sequence_data.length; j++) {
        // sequence data is from 0-1 so it gets scaled into the step range at run time.
        let sequence_step = Math.round(fp.sequence_data[j] * (steps)) + 1;
        if (current_step == sequence_step) {
          try {
            sound.play(`tmp/${fp.name}-out.wav`,1);
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
          }
        }
      }

      // MIDI CC logic
      for (var j = 0; j < fp.cc_data.length; j++) {
        let cc = fp.cc_data[j];
        // convert cc steps to positions based on global step resolution
        let cc_fp = scalePatternToSteps(cc.data,steps);
        let value = cc_fp.data[current_step-1];
        if ( typeof midioutput !== 'undefined' ) {
          midioutput.send('cc', {
            controller: cc.controller,
            value: value,
            channel: cc.channel
          });
        }
      }

      // MIDI pitchbend logic
      for (var j = 0; j < fp.pitchbend_data.length; j++) {
        let pb = fp.pitchbend_data[j];
        // convert cc steps to positions based on global step resolution
        let pb_fp = scalePatternToSteps(pb.data,steps);
        let value = pb_fp.data[current_step-1];
        if ( typeof midioutput !== 'undefined' ) {
          midioutput.send('pitch', {
            value:value,
            channel:pb.channel
          });
        }
      }
    }
    if ( current_step >= steps ) {
      // end of loop, tell pattern server to start processing next loop
      axios.get('http://localhost:1123/update');
      // go back to the first step
      current_step = 1;
      cycles_elapsed++;
    }
    else {
      current_step++;
    }
    handleBpmChange();
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
