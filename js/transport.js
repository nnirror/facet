const fs = require('fs');
const sound = require('./lib/play_sound.js');
const easymidi = require('easymidi');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const request = require('request');
let cycles_elapsed = 0;
let current_step = 1;
let midioutput = new easymidi.Output(easymidi.getOutputs()[0]);
let bpm = 90;
let transport_on = true;
let steps = 16;
let global_speed = ((60000 / bpm) / steps) * 4;
let speed = global_speed;
let repeater = setInterval(repeaterFn, global_speed);
let hooks_muted = false;
let hooks = getHooks();
let facet_patterns = getPatterns();

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

app.post('/midi', (req, res) => {
  res.send({
    data:easymidi.getOutputs()
  });
});

app.get('/update', (req, res) => {
  hooks = getHooks();
  facet_patterns = getPatterns();
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
  fs.writeFileSync('js/patterns.json', '{}');
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
  fs.writeFileSync('js/hooks.json', '{}');
  res.send({
    cleared: true
  });
});

const server = app.listen(3211);


function repeaterFn() {
  if ( transport_on !== false) {
    // main stepping loop
    let prev_step = current_step-1;
    for (const [hook_key, hook] of Object.entries(hooks)) {
        if ( (Number(hook_key) >= ((prev_step) / steps) && Number(hook_key) < ((current_step+1) / steps))
          &&  hooks_muted == false ) {
          hook.forEach(h => {
            // only run hook when cycles_elapsed % every == 0
            if ( cycles_elapsed % h.every == 0 ) {
              // post back to :1123 to rerun any hooks at this step
              request({
                  url: "http://localhost:1123/hook",
                  method: "POST",
                  body: h.command
              }, function (error, response, body){
              });
            }
          });
        }
    }

    // begin looping through all facet patterns, looking for wavs/notes/CCs to play
    for (const [k, fp] of Object.entries(facet_patterns)) {
      for (var j = 0; j < fp.sequence_data.length; j++) {
        // sequence data is from 0-1 so it gets scaled into the step range at run time.
        let sequence_step = Math.round(fp.sequence_data[j] * (steps-1)) + 1;
        if (current_step == sequence_step) {
          try {
            sound.play(`tmp/${fp.name}.wav`,1);
            if ( fp.sequence_data.length == 1 ) {
              delete facet_patterns[k];
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
        }
      }
    }

    if ( current_step >= steps ) {
      current_step = 1;
      for (const [k, fp] of Object.entries(facet_patterns)) {
        if ( fp.loop_has_occurred === true && fp.looped === false ) {
          // delete sequences set via .play() instead of .repeat(), after one cycle
          delete facet_patterns[k];
        }
        fp.loop_has_occurred = true;
      }
      cycles_elapsed++;
    }
    else {
      current_step++;
    }
    // todo fix bpm and steps here..
    global_speed = ((60000 / bpm) / steps) * 4;
    if ( speed != global_speed ) {
     clearInterval(repeater);
     speed = global_speed;
     repeater = setInterval(repeaterFn, global_speed);
    }
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

function noteoff(note,channel) {
  if ( typeof midioutput !== 'undefined' ) {
    midioutput.send('noteoff', {
      note: note,
      velocity: 0,
      channel: channel
    });
  }
}

function getPatterns() {
  try {
    return JSON.parse(fs.readFileSync('js/patterns.json', 'utf8', (err, data) => {
      return data
    }));
  } catch (e) {
    return {};
  }
}

function getHooks() {
  try {
    return JSON.parse(fs.readFileSync('js/hooks.json', 'utf8', (err, data) => {
      return data
    }));
  } catch (e) {
    return {};
  }
}
