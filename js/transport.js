const FacetPattern = require('./FacetPattern.js');
const { exec } = require('child_process');
const fs = require('fs');
const {WebMidi} = require('webmidi');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const axios = require('axios');
const OSCPACKAGE = require('osc-js');
const osc_package = new OSCPACKAGE({
  discardLateMessages: false,
  plugin: new OSCPACKAGE.WebsocketServerPlugin()
});
const FacetConfig = require('./config.js');
const FACET_SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
const OSC_OUTPORT = FacetConfig.settings.OSC_OUTPORT;
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
let meta_data = {
  bpm: [90],
  steps: [16]
};
let prev_bpm;
let prev_steps;
let cross_platform_slash = process.platform == 'win32' ? '\\' : '/';
let cross_platform_play_command = process.platform == 'win32' ? 'sox' : 'play';
let cross_platform_sox_config = process.platform == 'win32' ? '-t waveaudio' : '';
process.title = 'facet_transport';

osc_package.open({ port: OSC_OUTPORT });
app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));
app.use(bodyParser.json({limit: '1000mb'}));
app.use(cors());

axios.interceptors.response.use(res=>{return res}, (error) => {
  // do nothing, necessary for windows to preven fatal 500s
  // with axios as transport starts up
 });

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

app.post('/meta', (req, res) => {
  let posted_pattern = JSON.parse(req.body.pattern);
  if ( req.body.type == 'bpm' ) {
    meta_data.bpm = posted_pattern.data;
  }
  if ( req.body.type == 'steps' ) {
    meta_data.steps = posted_pattern.data;
  }
  res.sendStatus(200);
});

app.post('/update', (req, res) => {
  let posted_pattern = JSON.parse(req.body.pattern);
  facet_patterns[posted_pattern.name] = posted_pattern;
  playback_data[posted_pattern.name] = {
    sequence_data: posted_pattern.sequence_data,
    notes: posted_pattern.notes,
    cc_data: posted_pattern.cc_data,
    pitchbend_data: posted_pattern.pitchbend_data,
    osc_data: posted_pattern.osc_data,
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
  meta_data.bpm = [Math.abs(Number(req.body.bpm))];
  res.sendStatus(200);
});

app.post('/play', (req, res) => {
  transport_on = true;
  axios.get('http://localhost:1123/update');
  res.sendStatus(200);
});

app.post('/status', (req, res) => {
  // rewrite env.js, the environment variables that can be accessed in all future evals.
  // it's loaded into each FacetPattern instance on consruction
  fs.writeFileSync('js/env.js',
    calculateNoteValues(bpm) +
    `var bpm=${bpm};var mousex=${req.body.mousex};var mousey=${req.body.mousey};`,
    ()=> {}
  );
  res.sendStatus(200);
});

app.post('/steps', (req, res) => {
  meta_data.steps = [Math.abs(Number(req.body.steps))];
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
    // first, check if bpm or steps needs to be recalculated
    let scaledSteps = scalePatternToSteps(meta_data.steps,steps);
    let calcSteps = typeof scaledSteps[current_step-1] != 'undefined' ? scaledSteps[current_step-1] : steps;
    let scaledBpm = scalePatternToSteps(meta_data.bpm,steps);
    let calcBpm = typeof scaledBpm[current_step-1] != 'undefined' ? scaledBpm[current_step-1] : bpm;
    try {
      // when the bpm is scaled to match steps, it can have more than 1 value per step - this always selects the first
      if (typeof calcBpm == 'object') {
        bpm = calcBpm[0];
      }
      if (typeof calcSteps == 'object') {
        steps = calcSteps[0];
      }
    } catch (e) {

    }
    let max_steps_for_bpm = calculateMaximumSamplesPlayedPerStep(bpm);
    if ( steps > max_steps_for_bpm ) {
      steps = max_steps_for_bpm;
    }
    if ( (bpm != prev_bpm) || (steps != prev_steps) ) {
      reportTransportMetaData(bpm,steps);
    }

    handleBpmChange();
    let count_wav_files_played_this_step = 0;
    // begin looping through all facet patterns, looking for wavs/notes/CCs to play
    for (const [k, fp] of Object.entries(playback_data)) {
      let playback_sequence_data_scaled = scalePatternToSteps(fp.sequence_data,max_steps_for_bpm);
      count_wav_files_played_this_step = 0;
      for (var j = 0; j < playback_sequence_data_scaled.length; j++) {
        // sequence data is from 0-1 so it gets scaled into the step range at run time.
        let sequence_step = Math.round(playback_sequence_data_scaled[j][0] * (steps)) + 1;
        if (current_step == sequence_step) {
          try {
            // any pattern can play maximum 1 time per step
            if ( count_wav_files_played_this_step < 1 ) {
              exec(`${cross_platform_play_command} tmp${cross_platform_slash}${k}-out.wav ${cross_platform_sox_config} gain -6`, (error, stdout, stderr) => {});
            }
            count_wav_files_played_this_step++;
          } catch (e) {}
        }
      }
      try {
        // MIDI note logic
        let prev_velocity, prev_duration;
        for (var j = 0; j < fp.notes.length; j++) {
          let note = fp.notes[j];
          if (!note) { continue; }
          let scaled_data = scaleNotePatternToSteps(note.data,steps);
          // now we need to loop thru scaled_data and find the corresponding v & d
          let maximum_values_in_step = scaled_data[0].length;
          let all_notes_in_step = scaled_data[current_step-1];
          for (var p = 0; p < maximum_values_in_step; p++) {
            let note_inside_step = all_notes_in_step[p];
            if ( note_inside_step != 'skip' && !isNaN(note_inside_step) ) {
              let velocity_data, duration_data;
              velocity_data = scalePatternToSteps(note.velocity.data,steps);
              let maximum_values_in_velocity_data = velocity_data[0].length;
              let v;
              if ( (p+1) > maximum_values_in_velocity_data ) {
                v = Math.round(velocity_data[current_step-1][0]);
              }
              else {
                v = Math.round(velocity_data[current_step-1][p]);
              }
              duration_data = scalePatternToSteps(note.duration.data,steps);
              let maximum_values_in_duration_data = duration_data[0].length;
              let d;
              if ( (p+1) > maximum_values_in_duration_data ) {
                d = duration_data[current_step-1][0];
              }
              else {
                d = duration_data[current_step-1][p];
              }
              // generate MIDI note on/off pair for this step
              let n = Math.round(note_inside_step);
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
        }
      } catch (e) {

      } finally {

      }

      try {
        // MIDI CC logic
        for (var j = 0; j < fp.cc_data.length; j++) {
          let cc = fp.cc_data[j];
          // convert cc steps to positions based on global step resolution
          let cc_fp = scalePatternToSteps(cc.data,steps);
          let value = Math.round(cc_fp[current_step-1][0]);
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
          let value = pb_fp[current_step-1][0];
          if ( typeof midioutput !== 'undefined' ) {
            midioutput.sendPitchBend(value, {
              channels:pb.channel
            });
          }
        }
      } catch (e) {

      } finally {

      }

      try {
        // OSC logic
        for (var j = 0; j < fp.osc_data.length; j++) {
          let od = fp.osc_data[j];
          // convert OSC steps to positions based on global step resolution
          let od_fp = scalePatternToSteps(od.data,steps);
          let value = od_fp[current_step-1][0];
          osc_package.send(new OSCPACKAGE.Message(`/${od.address}`, value));
        }
      } catch (e) {

      } finally {

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
    prev_bpm = bpm;
    prev_steps = steps;
  }
}

function calculateMaximumSamplesPlayedPerStep(bpm) {
  // scale the playback facet pattern steps based
  // on the current bpm to prevent overloading
  // while allowing a step-by-step playback triggering speed
  // near the 30Hz audio rate at that bpm
  if ( bpm <= 2 )  {
    return 4096;
  }
  else if ( bpm <= 4 )  {
    return 2048;
  }
  else if ( bpm <= 6 ) {
    return 1024;
  }
  else if ( bpm <= 12.5 )  {
    return 512;
  }
  else if ( bpm <= 25 )  {
    return 256;
  }
  else if ( bpm <= 50 )  {
    return 128;
  }
  else if ( bpm <= 100 )  {
    return 64;
  }
  else if ( bpm <= 200 )  {
    return 32;
  }
  else if ( bpm <= 400 )  {
    return 16;
  }
  else if ( bpm <= 800 )  {
    return 8;
  }
  else if ( bpm <= 1600 )  {
    return 4;
  }
  else {
    return 2;
  }
}

function handleBpmChange() {
  step_speed_ms = ((60000 / bpm) / steps) * 4;
  if ( step_speed_copy != step_speed_ms ) {
   clearInterval(running_transport);
   step_speed_copy = step_speed_ms;
   // compensate for any latency from the previous step
   running_transport = setInterval(tick, (new Date().getTime() + step_speed_ms) - new Date().getTime());
  }
}

function reportTransportMetaData() {
  axios.post('http://localhost:1123/meta',
    {
      bpm: JSON.stringify(bpm),
      steps: JSON.stringify(steps)
    }
  )
  .catch(function (error) {
    console.log(`error posting metadata to pattern server: ${error}`);
  });
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
  let num_values_per_step = Math.floor(orig_size / new_size);
  if (num_values_per_step < 1) {
    num_values_per_step = 1;
  }
  let reduced_sequence = [];
  for ( let i = 0; i < data.length; i+= num_values_per_step ) {
    let step_data = [];
    for (var a = 0; a < num_values_per_step; a++) {
      step_data.push(data[i+a]);
      // add each step
    }
    reduced_sequence.push(step_data);
  }
  return new FacetPattern().from(reduced_sequence).reduce(new_size).data;
}

function calculateNoteValues(bpm) {
  let out = '';
  for (var i = 1; i <= 128; i++) {
    let calculated_nv = Math.round((((60000/bpm)/i)*4)*(FACET_SAMPLE_RATE*0.001));
    out += `var n${i} = ${calculated_nv};`
  }
  return out;
}
