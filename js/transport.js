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
const EVENT_RESOLUTION_MS = FacetConfig.settings.EVENT_RESOLUTION_MS;
let bars_elapsed = 0;
let bpm = 90;
let next_step_expected_run_time = new Date().getTime() + EVENT_RESOLUTION_MS;
let running_transport = setInterval(tick,EVENT_RESOLUTION_MS);
let current_relative_step_position = 0;
let event_register = [];
let transport_on = true;
let facet_patterns = {};
let meta_data = {
  bpm: [90]
};
let latency_counter = 0;
let latency_calculated = 0;
let prev_bpm;
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
  res.sendStatus(200);
});

app.post('/play', (req, res) => {
  transport_on = true;
  res.sendStatus(200);
});

app.post('/update', (req, res) => {
  // only set data if the transport was not stopped while the pattern was generated
  if (transport_on === true) {

    let posted_pattern = JSON.parse(req.body.pattern);

    if ( posted_pattern.sequence_data.length > 0 ) {
      event_register[posted_pattern.name] = [];
      posted_pattern.sequence_data.forEach((step) => {
        event_register[posted_pattern.name].push(
          {
            position: step,
            type: "audio",
            data: [],
          }
        )
      });
    }

    if ( posted_pattern.notes.length > 0 ) {
      event_register[posted_pattern.name] = [];
      for (var i = 0; i < posted_pattern.notes.length; i++) {
        let note_data = posted_pattern.notes[i];
        if ( note_data.note >= 0 ) {
          event_register[posted_pattern.name].push(
            {
              position: (i/posted_pattern.notes.length),
              type: "note",
              data: note_data,
            }
          )
          for (var c = 0; c < posted_pattern.chord_intervals.length; c++) {
            let note_to_add = note_data.note + posted_pattern.chord_intervals[c];
            // check if key needs to be locked
            if ( posted_pattern.key_data !== false ) {
              note_to_add = new FacetPattern().from(note_to_add).key(posted_pattern.key_data).data[0];
            }

            event_register[posted_pattern.name].push(
              {
                position: (i/posted_pattern.notes.length),
                type: "note",
                data: {
                  note: note_to_add,
                  channel: note_data.channel,
                  velocity: note_data.velocity,
                  duration: note_data.duration
                },
              }
            )
          }
        }
      }
    }

    if ( typeof posted_pattern.cc_data.data !== 'undefined' ) {
      event_register[posted_pattern.name] = [];
      for (var i = 0; i < posted_pattern.cc_data.data.length; i++) {
        let cc_object = {
          data: posted_pattern.cc_data.data[i],
          controller: posted_pattern.cc_data.controller,
          channel: posted_pattern.cc_data.channel,
        };
        event_register[posted_pattern.name].push(
          {
            position: (i/posted_pattern.cc_data.data.length),
            type: "cc",
            data: cc_object,
          }
        )
      }
    }

    if ( typeof posted_pattern.pitchbend_data.data !== 'undefined' ) {
      event_register[posted_pattern.name] = [];
      for (var i = 0; i < posted_pattern.pitchbend_data.data.length; i++) {
        let pb_object = {
          data: posted_pattern.pitchbend_data.data[i],
          channel: posted_pattern.pitchbend_data.channel,
        };
        event_register[posted_pattern.name].push(
          {
            position: (i/posted_pattern.pitchbend_data.data.length),
            type: "pitchbend",
            data: pb_object,
          }
        )
      }
    }

    if ( typeof posted_pattern.osc_data.data !== 'undefined' ) {
      event_register[posted_pattern.name] = [];
      for (var i = 0; i < posted_pattern.osc_data.data.length; i++) {
        let osc_object = {
          data: posted_pattern.osc_data.data[i],
          address: posted_pattern.osc_data.address,
        };
        event_register[posted_pattern.name].push(
          {
            position: (i/posted_pattern.osc_data.data.length),
            type: "osc",
            data: osc_object,
          }
        )
      }
    }

  }
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

app.post('/status', (req, res) => {
  // rewrite env.js, the environment variables that can be accessed in all future evals.
  // it's loaded into each FacetPattern instance on consruction
  fs.writeFileSync('js/env.js',
    calculateNoteValues(bpm) +
    `var bpm=${bpm};var bars=${bars_elapsed};var mousex=${req.body.mousex};var mousey=${req.body.mousey};`,
    ()=> {}
  );
  res.sendStatus(200);
});

app.post('/stop', (req, res) => {
  event_register = [];
  transport_on = false;
  if ( typeof midioutput !== 'undefined' ) {
    midioutput.sendAllNotesOff();
  }
  res.sendStatus(200);
});

const server = app.listen(3211);

function tick() {
  // calculate based on bpm how many ticks at EVENT_RESOLUTION_MS equal a full loop
  // first need to figure out how many events per second run at EVENT_RESOLUTION_MS = Math.round(1000 / EVENT_RESOLUTION_MS)
  let events_per_second = 1000 / EVENT_RESOLUTION_MS; // for test purposes, 100 events per second at 10ms global event resolution
  // now figure out how many seconds it will take for 4 quarter notes to occur: BPM / 4.
  let loops_per_minute = bpm / 4; // in this case = 15
  let loops_per_second = loops_per_minute / 60; // in this case = 0.25
  let seconds_per_loop = 60 / loops_per_minute; // in this case = 4
  let events_per_loop = seconds_per_loop * events_per_second; //  in this case, 4 * 100 = 400
  let relative_step_amount_to_add_per_loop = 1 / events_per_loop; // in this case, 1/400 = 0.0025
  current_relative_step_position += relative_step_amount_to_add_per_loop;
  if ( current_relative_step_position > 1.00001 ) {
    current_relative_step_position = 0;
    bars_elapsed++;
  }

  let scaledBpm = scalePatternToSteps(meta_data.bpm,events_per_loop);

  let calcBpm = typeof scaledBpm[Math.round(current_relative_step_position*events_per_loop)-1] != 'undefined' ? scaledBpm[Math.round(current_relative_step_position*events_per_loop)-1] : bpm;
  try {
    // when the bpm is scaled to match steps, it can have more than 1 value per step - this always selects the first
    if (typeof calcBpm == 'object') {
      bpm = calcBpm[0];
    }
  } catch (e) {

  }

  if ( transport_on === true ) {
    handleBpmChange();
    for (const [fp_name, fp_data] of Object.entries(event_register)) {
      let count_times_fp_played = 0;
      fp_data.forEach((event) => {
        if ( event.position >= current_relative_step_position
          && event.position < (current_relative_step_position + relative_step_amount_to_add_per_loop) ) {
          // fire all events for this facetpattern matching the current step
          if ( event.type === "audio" ) {
            // play any audio files at this step
            if ( count_times_fp_played < 1 ) {
              exec(`${cross_platform_play_command} tmp${cross_platform_slash}${fp_name}-out.wav ${cross_platform_sox_config} gain -6`, (error, stdout, stderr) => {});
            }
            count_times_fp_played++;
          }
          if ( event.type === "note" ) {
            // play any notes at this step
            try {
              if ( typeof midioutput !== 'undefined' ) {
                midioutput.playNote(event.data.note, {
                  rawAttack:event.data.velocity,
                  channels:event.data.channel,
                  duration:event.data.duration,
                  rawRelease:64
                });
              }
            } catch (e) {}
          }

          if ( event.type === "cc" ) {
            // send any cc data at this step
            try {
              if ( typeof midioutput !== 'undefined' ) {
                midioutput.sendControlChange(event.data.controller, Math.round(event.data.data), {
                  channels:event.data.channel
                });
              }
            } catch (e) {}
          }

          if ( event.type === "pitchbend" ) {
            // send any pitchbend data at this step
            try {
              if ( typeof midioutput !== 'undefined' ) {
                midioutput.sendPitchBend(event.data.data, {
                  channels:event.data.channel
                });
              }
            } catch (e) {}
          }

          if ( event.type === "osc" ) {
            // send any osc data at this step
            try {
              osc_package.send(new OSCPACKAGE.Message(`/${event.data.address}`, event.data.data));
            } catch (e) {}
          }

        }
      });
    }

    if (current_relative_step_position == 0) {
      // tell pattern server to start processing next loop
      axios.get('http://localhost:1123/update');
    }
  }
}

function handleBpmChange() {
  // compensate for any latency from the previous step
  let latency_compensation_from_previous_step_ms = new Date().getTime() - next_step_expected_run_time;
  if ( latency_compensation_from_previous_step_ms > 100 ) {
    // don't compensate for when "latency" from the previous step is > 100ms, as it would indicate
    // the transport has just been restarted rather than due to latency
    running_transport = setInterval(tick,EVENT_RESOLUTION_MS);
    next_step_expected_run_time = new Date().getTime() + EVENT_RESOLUTION_MS;
  }
  else {
    // apply calculated latency to next 16 steps
    clearInterval(running_transport);
    running_transport = setInterval(tick, (EVENT_RESOLUTION_MS - latency_compensation_from_previous_step_ms));
    next_step_expected_run_time = new Date().getTime() + (EVENT_RESOLUTION_MS - latency_compensation_from_previous_step_ms);
    latency_calculated = 0;
    reportTransportMetaData();
  }
}

function reportTransportMetaData() {
  axios.post('http://localhost:1123/meta',
    {
      bpm: JSON.stringify(bpm)
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
