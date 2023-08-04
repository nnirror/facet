const FacetPattern = require('./FacetPattern.js');
const { exec } = require('child_process');
const fs = require('fs');
const {WebMidi} = require('webmidi');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const axios = require('axios');
const FacetConfig = require('./config.js');
const OSC = require('osc-js')
const udp_osc_server = new OSC({ plugin: new OSC.DatagramPlugin({ send: { port: FacetConfig.settings.OSC_OUTPORT } }) })
udp_osc_server.open({ port: 2134 });
const EVENT_RESOLUTION_MS = FacetConfig.settings.EVENT_RESOLUTION_MS;
let bars_elapsed = 0;
let bpm = 90;
let prev_bpm = 90;
let voice_number_to_load = 1;
let VOICES = 8;
let voice_allocator = initializeVoiceAllocator();;
let current_relative_step_position = 0;
let event_register = [];
let transport_on = true;
let meta_data = {
  bpm: [90]
};
process.title = 'facet_transport';

const editor_osc_server = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
editor_osc_server.open();

app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));
app.use(bodyParser.json({limit: '1000mb'}));
app.use(cors());

// pass bpm and bars_elapsed every 20ms
setInterval(reportTransportMetaData,20);

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
  // open audio playback gate in Max
  udp_osc_server.send(new OSC.Message(`/on`, 1));
  res.sendStatus(200);
});

app.post('/update', (req, res) => {
  // only set data if the transport was not stopped while the pattern was generated
  if (transport_on === true) {
    let posted_pattern = JSON.parse(req.body.pattern);
    let facet_pattern_name = posted_pattern.name.split('---')[0];
    if ( posted_pattern.sequence_data.length > 0 ) {
      allocateVoice(posted_pattern);
      udp_osc_server.send(new OSC.Message(`/load`, `${voice_number_to_load} ${posted_pattern.name}-out.wav ${posted_pattern.bpm_at_generation_time}`));
      event_register[facet_pattern_name] = [];
      posted_pattern.sequence_data.forEach((step) => {
        event_register[facet_pattern_name].push(
          {
            position: step,
            type: "audio",
            data: [],
            play_once: posted_pattern.play_once,
            voice: voice_number_to_load,
            fired: false
          }
        )
      });
    }

    if ( posted_pattern.notes.length > 0 ) {
      event_register[facet_pattern_name] = [];
      for (var i = 0; i < posted_pattern.notes.length; i++) {
        let note_data = posted_pattern.notes[i];
        if ( note_data.note >= 0 ) {
          event_register[facet_pattern_name].push(
            {
              position: (i/posted_pattern.notes.length),
              type: "note",
              data: note_data,
              play_once: posted_pattern.play_once,
              fired: false
            }
          )
          for (var c = 0; c < posted_pattern.chord_intervals.length; c++) {
            let note_to_add = note_data.note + posted_pattern.chord_intervals[c];
            // check if key needs to be locked
            if ( posted_pattern.key_data !== false ) {
              note_to_add = new FacetPattern().from(note_to_add).key(posted_pattern.key_data).data[0];
            }

            event_register[facet_pattern_name].push(
              {
                position: (i/posted_pattern.notes.length),
                type: "note",
                data: {
                  note: note_to_add,
                  channel: note_data.channel,
                  velocity: note_data.velocity,
                  duration: note_data.duration,
                  play_once: posted_pattern.play_once,
                  fired: false
                },
              }
            )
          }
        }
      }
    }

    if ( typeof posted_pattern.cc_data.data !== 'undefined' ) {
      event_register[facet_pattern_name] = [];
      for (var i = 0; i < posted_pattern.cc_data.data.length; i++) {
        let cc_object = {
          data: posted_pattern.cc_data.data[i],
          controller: posted_pattern.cc_data.controller,
          channel: posted_pattern.cc_data.channel,
        };
        event_register[facet_pattern_name].push(
          {
            position: (i/posted_pattern.cc_data.data.length),
            type: "cc",
            data: cc_object,
            play_once: posted_pattern.play_once,
            fired: false
          }
        )
      }
    }

    if ( typeof posted_pattern.pitchbend_data.data !== 'undefined' ) {
      event_register[facet_pattern_name] = [];
      for (var i = 0; i < posted_pattern.pitchbend_data.data.length; i++) {
        let pb_object = {
          data: posted_pattern.pitchbend_data.data[i],
          channel: posted_pattern.pitchbend_data.channel,
        };
        event_register[facet_pattern_name].push(
          {
            position: (i/posted_pattern.pitchbend_data.data.length),
            type: "pitchbend",
            data: pb_object,
            play_once: posted_pattern.play_once,
            fired: false
          }
        )
      }
    }

    if ( typeof posted_pattern.osc_data.data !== 'undefined' ) {
      event_register[facet_pattern_name] = [];
      for (var i = 0; i < posted_pattern.osc_data.data.length; i++) {
        let osc_object = {
          data: posted_pattern.osc_data.data[i],
          address: posted_pattern.osc_data.address,
        };
        event_register[facet_pattern_name].push(
          {
            position: (i/posted_pattern.osc_data.data.length),
            type: "osc",
            data: osc_object,
            play_once: posted_pattern.play_once,
            fired: false
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

app.get('/status', (req,res)=> {
  res.send({
    data: {
      bpm: bpm,
      bars_elapsed: bars_elapsed
    },
    status: 200
  });
})

app.post('/bpm', (req, res) => {
  meta_data.bpm = [Math.abs(Number(req.body.bpm))];
  res.sendStatus(200);
});

app.post('/stop', (req, res) => {
  event_register = [];
  transport_on = false;
  voice_allocator = initializeVoiceAllocator();
  if ( typeof midioutput !== 'undefined' ) {
    midioutput.sendAllNotesOff();
  }
  // close audio playback gate in Max
  udp_osc_server.send(new OSC.Message(`/on`, 0));
  // clear out any dynamic BPM patterns, so BPM stays at whatever value it was prior to stopping
  meta_data.bpm = bpm;
  res.sendStatus(200);
});

app.listen(3211);

let expectedTime = Date.now() + EVENT_RESOLUTION_MS;
let loop_start_time = Date.now();
let bpm_recalculation_counter = -1;
let scaledBpm;
let delay;
// send bpm to Max
udp_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
editor_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));

function tick() {
  let events_per_second = 1000 / EVENT_RESOLUTION_MS;
  let loops_per_minute = bpm / 4;
  let seconds_per_loop = 60 / loops_per_minute;
  let events_per_loop = seconds_per_loop * events_per_second;
  let relative_step_amount_to_add_per_loop = 1 / events_per_loop;
  bpm_recalculation_counter++;
  current_relative_step_position += relative_step_amount_to_add_per_loop;
  if ( current_relative_step_position > 1.00001 ) {
    current_relative_step_position = 0;
    bars_elapsed++;
    // tell pattern server to start processing next loop
    requestNewPatterns();
    // increment loops since generation for all voices
    updateVoiceAllocator();
    // set all "fired" values to false at beginning of loop
    resetEventRegister();
    udp_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
    editor_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
    loop_start_time = Date.now();
  }

  checkForBpmRecalculation(events_per_loop);
  loops_per_minute = bpm / 4;
  seconds_per_loop = 60 / loops_per_minute;
  events_per_loop = seconds_per_loop * events_per_second;
  relative_step_amount_to_add_per_loop = 1 / events_per_loop;

  if ( transport_on === true ) {
    for (const [fp_name, fp_data] of Object.entries(event_register)) {
      let count_times_fp_played = 0;
      fp_data.forEach((event) => {
        if ( event.position >= current_relative_step_position
          && (event.position < (current_relative_step_position + (relative_step_amount_to_add_per_loop * 16)) && event.fired === false ) ) {
            event.fired = true;
          // fire all events for this facetpattern matching the current step
          if ( event.type === "audio" ) {
            // play any audio files at this step
            if ( count_times_fp_played < 1 ) {
              // osc event to play back audio file in Max (or elsewhere)
              udp_osc_server.send(new OSC.Message(`/play`, `${event.voice}`));
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
              udp_osc_server.send(new OSC.Message(`${event.data.address}`, event.data.data));
            } catch (e) {}
          }

          // remove any events from the event register that are intended to play only once
          if ( event.play_once === true ) {
            delete event_register[fp_name];
          }

        }
      });
    }
  }
  delay = Math.max(0, EVENT_RESOLUTION_MS - (Date.now() - expectedTime));
  editor_osc_server.send(new OSC.Message(`/progress`, `${current_relative_step_position}`));
  expectedTime += EVENT_RESOLUTION_MS;

  checkIfTransportShouldMoveToNextQuarterNote(seconds_per_loop,relative_step_amount_to_add_per_loop);

  setTimeout(tick, delay);
}

tick();

function reportTransportMetaData() {
  // pass along the current bpm and bars elapsed, if the transport is running
  if ( transport_on === true ) {
    axios.post('http://localhost:1123/meta',
    {
      bpm: JSON.stringify(bpm),
      bars_elapsed: JSON.stringify(bars_elapsed)
    }
  )
  .catch(function (error) {
    console.log(`error posting metadata to pattern server: ${error}`);
  });
  }
}

function requestNewPatterns () {
  if ( bars_elapsed > 0 ) {
    // tell server to generate any new patterns
    axios.get('http://localhost:1123/update');
  }
}

function resetEventRegister() {
  for (const [fp_name, fp_data] of Object.entries(event_register)) {
    for (let i = 0; i < event_register[fp_name].length; i++) {
      event_register[fp_name][i].fired = false;
    }
  }
}

function checkForBpmRecalculation (events_per_loop) {
  if ( bpm_recalculation_counter % 8 == 0 ) {
    scaledBpm = scalePatternToSteps(meta_data.bpm,events_per_loop);
  }
  let calcBpm = typeof scaledBpm[Math.round(current_relative_step_position*events_per_loop)-1] != 'undefined' ? scaledBpm[Math.round(current_relative_step_position*events_per_loop)-1] : bpm;
  if (Array.isArray(calcBpm)) {
    bpm = Number(calcBpm[0]);
  }
  if ( prev_bpm != bpm || bpm_recalculation_counter % 8 == 0 ) {
    prev_bpm = bpm;
    udp_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
    editor_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
  }
}

function checkIfTransportShouldMoveToNextQuarterNote(seconds_per_loop,relative_step_amount_to_add_per_loop) {
  // immediately move to next quarter note if delays start adding up
  if ( Date.now() - loop_start_time > seconds_per_loop * 1000 ) {
    current_relative_step_position = 1;
    loop_start_time = Date.now();
    delay = 0;
  }
  if (current_relative_step_position >= .99 && current_relative_step_position < 1) {
    if (Date.now() - loop_start_time > seconds_per_loop * 1000) {
      current_relative_step_position = 1;
      loop_start_time = Date.now();
      delay = 0;
    }
  }
  else if (current_relative_step_position >= .2 && current_relative_step_position < .25 + relative_step_amount_to_add_per_loop) {
    if (Date.now() - loop_start_time > seconds_per_loop * .25 * 1000) {
      delay = 0;
      current_relative_step_position = 0.25;
    }
  }
  else if (current_relative_step_position >= .45 && current_relative_step_position < .5 + relative_step_amount_to_add_per_loop) {
    if (Date.now() - loop_start_time > seconds_per_loop * .5 * 1000) {
      delay = 0;
      current_relative_step_position = 0.5;
    }
  }
  else if (current_relative_step_position >= .7 && current_relative_step_position < .75 + relative_step_amount_to_add_per_loop) {
    if (Date.now() - loop_start_time > seconds_per_loop * .75 * 1000) {
      delay = 0;
      current_relative_step_position = 0.75;
    }
  }
}

function allocateVoice(posted_pattern) {
  let new_voice = new AudioPlaybackVoice(posted_pattern);
  // determine the voice number where new_voice can go
  let new_voice_found = false;
  let voice_checks = 0;
  while ( new_voice_found == false && voice_checks < VOICES ) {
    if ( voice_allocator[voice_number_to_load].overwritable === true || voice_allocator[voice_number_to_load] === false ) {
      // new voice found
      voice_allocator[voice_number_to_load] = new_voice;
      new_voice_found = true;
    }
    else {
      // continue looking for available voices
      voice_checks++;
    }
    voice_number_to_load++;
      if ( voice_number_to_load > VOICES ) {
        voice_number_to_load = 1;
      }
  }
  if ( new_voice_found === false ) {
    // all voices busy - steal the one at the current index after looping through
    voice_allocator[voice_number_to_load] = new_voice;
  }
}

function initializeVoiceAllocator() {
	let obj = {};
	for (let i = 1; i <= VOICES; i++) {
		obj[i] = false;
	}
	return obj;
}

function updateVoiceAllocator() {
	for (let key in voice_allocator) {
		if (voice_allocator[key] instanceof AudioPlaybackVoice) {
			voice_allocator[key].loops_since_generation++;
			if (voice_allocator[key].loops_since_generation >= voice_allocator[key].every) {
				voice_allocator[key] = false;
			}
		}
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

class AudioPlaybackVoice {
	constructor(posted_pattern) {
		this.name = posted_pattern.name;
		this.keep = posted_pattern.do_not_regenerate;
		this.every = posted_pattern.regenerate_every_n_loops;
    this.loops_since_generation = 0;
		this.once = posted_pattern.play_once;
		this.bpm = posted_pattern.bpm_at_generation_time;
		this.overwritable = posted_pattern.do_not_regenerate === true || posted_pattern.regenerate_every_n_loops > 1 ? false : true;
	}
}