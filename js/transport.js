const { exec } = require('child_process');
const fs = require('fs');
const sound = require('./lib/play_sound.js');
const {WebMidi} = require('webmidi');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const axios = require('axios');
let cycles_elapsed = 0;
let current_step = 1;
let bpm = 90;
let steps = 16;
let step_speed_ms = ((60000 / bpm) / steps) * 2;
let step_speed_copy = step_speed_ms;
let running_transport = setInterval(tick, step_speed_ms);
let transport_on = true;
let facet_patterns = {};
let playback_data = {};

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(bodyParser.json({limit: '100mb'}));
app.use(cors());

WebMidi.enable();
let midioutput;

app.post('/midi', (req, res) => {
  let midi_port_names = [];
  for (var i = 0; i < WebMidi.outputs.length; i++) {
    midi_port_names.push(WebMidi.outputs[i]._midiOutput.name);
  }
  res.send({
    data:midi_port_names
  });
});

app.post('/update', (req, res) => {
  let posted_pattern = JSON.parse(req.body.pattern);
  facet_patterns[posted_pattern.name] = posted_pattern;
  playback_data[posted_pattern.name] = {
    sequence_data: posted_pattern.sequence_data,
    notes: posted_pattern.notes,
    cc_data: posted_pattern.cc_data,
    pitchbend_data: posted_pattern.pitchbend_data
  };
  res.sendStatus(200);
});

app.post('/midi_select', (req, res) => {
  try {
    midioutput = WebMidi.getOutputByName(req.body.output);
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
  current_step = 1;
  transport_on = true;
  axios.get('http://localhost:1123/update');
  res.sendStatus(200);
});

app.post('/steps', (req, res) => {
  steps = Math.abs(Number(req.body.steps));
  res.sendStatus(200);
});

app.post('/stop', (req, res) => {
  if ( typeof midioutput !== 'undefined' ) {
    midioutput.sendAllNotesOff();
  }
  facet_patterns = {};
  playback_data = {};
  transport_on = false;
  res.sendStatus(200);
});

const server = app.listen(3211);

function tick() {
  if ( transport_on !== false) {
    // main stepping loop
    let prev_step = current_step-1;
    // begin looping through all facet patterns, looking for wavs/notes/CCs to play
    for (const [k, fp] of Object.entries(playback_data)) {
      for (var j = 0; j < fp.sequence_data.length; j++) {
        // sequence data is from 0-1 so it gets scaled into the step range at run time.
        let sequence_step = Math.round(fp.sequence_data[j] * (steps)) + 1;
        if (current_step == sequence_step) {
          try {
            sound.play(`tmp/${k}-out.wav`,1);
          } catch (e) {}
        }
      }
      // MIDI note logic
      let prev_velocity, prev_duration;
      for (var j = 0; j < fp.notes.length; j++) {
        let note = fp.notes[j];
        if (!note) { continue; }
        let scaled_data = scaleNotePatternToSteps(note.data,steps);
        if ( scaled_data[current_step-1] && scaled_data[current_step-1] != 'skip' && !isNaN(scaled_data[current_step-1]) ) {
          let velocity_data, duration_data;
          velocity_data = scalePatternToSteps(note.velocity.data,steps);
          duration_data = scalePatternToSteps(note.duration.data,steps);
          // generate MIDI note on/off pair for this step
          let n = Math.round(scaled_data[current_step-1]);
          let v = velocity_data[current_step-1];
          let d = duration_data[current_step-1];
          let c = note.channel;
          try {
            if ( typeof midioutput !== 'undefined' ) {
              midioutput.playNote(n, {
                rawAttack:v,
                channels:c,
                duration:d,
                rawRelease:64
              });
            }
          } catch (e) {
            throw e
          }
        }
      }

      // MIDI CC logic
      for (var j = 0; j < fp.cc_data.length; j++) {
        let cc = fp.cc_data[j];
        // convert cc steps to positions based on global step resolution
        let cc_fp = scalePatternToSteps(cc.data,steps);
        let value = Math.round(cc_fp[current_step-1]);
        if ( typeof midioutput !== 'undefined' ) {
          midioutput.sendControlChange(cc.controller, value, {
            channels:cc.channel
          });
        }
      }

      // MIDI pitchbend logic
      for (var j = 0; j < fp.pitchbend_data.length; j++) {
        let pb = fp.pitchbend_data[j];
        // convert cc steps to positions based on global step resolution
        let pb_fp = scalePatternToSteps(pb.data,steps);
        let value = pb_fp[current_step-1];
        if ( typeof midioutput !== 'undefined' ) {
          midioutput.sendPitchBend(value, {
            channels:pb.channel
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

function scalePatternToSteps(pattern,steps) {
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
    return simpleReduce(upscaled_data, steps);
  }
  else {
    // downscale
    return simpleReduce(pattern, steps);
  }
}

function scaleNotePatternToSteps(pattern,steps) {
  // scale note pattern onto a bar of length _steps_.
  if (pattern.length < steps ) {
    // upscale
    let upscaled_data = new Array(steps).fill('skip');
    for (var n = 0; n < pattern.length; n++) {
      let relative_index = n/(pattern.length);
      if (isNaN(relative_index)) {
        relative_index = 0;
      }
      upscaled_data[Math.floor(relative_index * steps)] = pattern[n];
    }
    return simpleReduce(upscaled_data, steps);
  }
  else {
    // downscale
    return simpleReduce(pattern, steps);
  }
}

function simpleReduce (data, new_size) {
  let orig_size = data.length;
  let reduced_sequence = [];
  for ( let i = 0; i < new_size; i++ ) {
    let large_array_index = Math.floor(i * (orig_size + Math.floor(orig_size / new_size)) / new_size);
    reduced_sequence[i] = data[large_array_index];
  }
  return reduced_sequence;
}
