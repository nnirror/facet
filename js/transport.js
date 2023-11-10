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
const SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
const OSC = require('osc-js')
const udp_osc_server = new OSC({ plugin: new OSC.DatagramPlugin({ send: { port: FacetConfig.settings.OSC_OUTPORT } }) })
udp_osc_server.open({ port: 2134 });
const EVENT_RESOLUTION_MS = FacetConfig.settings.EVENT_RESOLUTION_MS;
let bars_elapsed = 0;
let bpm = 90;
let prev_bpm = 90;
let voice_number_to_load = 1;
let browser_sound_output = true;
let VOICES = 16;
let voice_allocator = initializeVoiceAllocator();
let voices_to_send_to_browser = [];
let patterns_for_next_loop = {};
let stopped_patterns = [];
let patterns_that_have_been_stopped = [];
let patterns_to_delete_at_end_of_loop = [];
let current_relative_step_position = 0;
let event_register = [];
let transport_on = true;
let meta_data = {
  bpm: [90]
};
process.title = 'facet_transport';

const editor_osc_server = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin({ url: `ws://localhost:${FacetConfig.settings.EDITOR_OSC_OUTPORT}` })
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
  res.sendStatus(200);
});

app.get('/load', (req, res) => {
  res.json(voices_to_send_to_browser);
  voices_to_send_to_browser = [];
});

app.post('/update', (req, res) => {
  // only set data if the transport was not stopped while the pattern was generated
  if (transport_on === true) {
    let posted_pattern = JSON.parse(req.body.pattern);
    let facet_pattern_name = posted_pattern.name.split('---')[0];

    if ( posted_pattern.is_stopped === true || facet_pattern_name in patterns_that_have_been_stopped ) {
      stopped_patterns.push(facet_pattern_name);
      stopVoice(posted_pattern.name);
      delete patterns_that_have_been_stopped[facet_pattern_name];
      return;
    }

    if ( posted_pattern.sequence_data.length > 0 ) {
      allocateVoice(posted_pattern);
      let is_mono = posted_pattern.pan_data === false && posted_pattern.dacs == '1 1' ? 1 : 0;
      if ( browser_sound_output === true ) {
        voices_to_send_to_browser.push(`${voice_number_to_load} ${posted_pattern.name}-out.wav ${posted_pattern.bpm_at_generation_time}`);
      }
      udp_osc_server.send(new OSC.Message(`/load`, `${voice_number_to_load} ${posted_pattern.name}-out.wav ${posted_pattern.bpm_at_generation_time} ${is_mono}`));
      event_register[facet_pattern_name] = [];
      posted_pattern.sequence_data.forEach((step) => {
        event_register[facet_pattern_name].push(
          {
            position: step,
            type: "audio",
            data: [],
            play_once: posted_pattern.play_once,
            voice: voice_number_to_load,
            fired: false,
            loadtime: Date.now()
          }
        )
      });
    }
    else {
      patterns_for_next_loop[facet_pattern_name] = posted_pattern;
    }
  }
  res.sendStatus(200);
});

app.post('/browser_sound', (req, res) => {
  browser_sound_output = req.body.browser_sound_output === 'true' ? true : false;
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
let bpm_was_changed_this_tick = false;
let bpm_was_changed_this_loop = false;
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
    Object.keys(patterns_to_delete_at_end_of_loop).forEach((fp_name) => {
      delete event_register[fp_name];
    });
    patterns_to_delete_at_end_of_loop = [];
    applyNextPatterns();
    patterns_for_next_loop = {};
    // tell pattern server to start processing next loop
    requestNewPatterns();
    // increment loops since generation for all voices
    updateVoiceAllocator();
    // set all "fired" values to false at beginning of loop
    resetEventRegister();
    udp_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
    editor_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
    loop_start_time = Date.now();
    bpm_was_changed_this_loop = false;
  }

  checkForBpmRecalculation(events_per_loop);
  loops_per_minute = bpm / 4;
  seconds_per_loop = 60 / loops_per_minute;
  events_per_loop = seconds_per_loop * events_per_second;
  relative_step_amount_to_add_per_loop = 1 / events_per_loop;

  let range_of_steps_to_check = 1;
  if ( bpm_was_changed_this_tick === true ) {
    range_of_steps_to_check = 16;
  }
  if ( transport_on === true ) {
    for (const [fp_name, fp_data] of Object.entries(event_register)) {
      let count_times_fp_played = 0;
      fp_data.forEach((event) => {
        if ( event.position >= current_relative_step_position
          && (event.position < (current_relative_step_position + (relative_step_amount_to_add_per_loop * range_of_steps_to_check)) && (event.fired === false) ) ) {
            event.fired = true;
          // fire all events for this facetpattern matching the current step
          if ( event.type === "audio" ) {
            // play any audio files at this step
            if ( count_times_fp_played < 1 ) {
              let pre_send_delay_ms = 0;
              // if the /play message is sent less than 100ms after the /load message, the file might not have finished
              //  loading into sfplay~ yet, so set a 10ms delay to give the loading time to complete
              if (Date.now() - event.loadtime < 100) {
                pre_send_delay_ms = 30;
              }
              // osc event to play back audio file in Max (or elsewhere)
              setTimeout(()=>{
                if ( browser_sound_output === true ) {
                  editor_osc_server.send(new OSC.Message(`/play`, `${event.voice}`))
                }
                udp_osc_server.send(new OSC.Message(`/play`, `${event.voice}`))
              },pre_send_delay_ms);
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
          if ( event.play_once === true && event.type === "audio" ) {
            delete event_register[fp_name];
          }

          if ( event.play_once === true && event.type !== "audio" ) {
            // delete event_register[fp_name];
            patterns_to_delete_at_end_of_loop[fp_name] = true;
          }

        }
      });
    }
  }
  delay = Math.max(0, EVENT_RESOLUTION_MS - (Date.now() - expectedTime));
  editor_osc_server.send(new OSC.Message(`/progress`, `${current_relative_step_position}`));
  expectedTime += EVENT_RESOLUTION_MS;

  // hard-reset loop position if bpm has been static for the entire loop and an entire loop of time has passed
  if ( bpm_was_changed_this_loop === false && Date.now() - loop_start_time > ((seconds_per_loop * 1000) - EVENT_RESOLUTION_MS) ) {
    delay = Math.round((seconds_per_loop * 1000) - (Date.now() - loop_start_time));
    current_relative_step_position = 1;
    loop_start_time = Date.now();
  }

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

function applyNextPatterns () {
  for (const [facet_pattern_name, posted_pattern] of Object.entries(patterns_for_next_loop)) {
    if ( stopped_patterns.includes(facet_pattern_name)) {
      return;
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
  stopped_patterns = [];
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

  if ( typeof scaledBpm[Math.round(current_relative_step_position*events_per_loop)-1] != 'undefined' ) {
    bpm = scaledBpm[Math.round(current_relative_step_position*events_per_loop)-1];
  }

  if ( prev_bpm != bpm ) {
    bpm_was_changed_this_tick = true;
    bpm_was_changed_this_loop = true;
    prev_bpm = bpm;
    udp_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
    editor_osc_server.send(new OSC.Message(`/bpm`, `${bpm}`));
  }
  else {
    bpm_was_changed_this_tick = false;
  }
}

function stopVoice (name) {
  // delete pattern from the event register matching this name.
  // run it every 500ms for 3 seconds because it's possible that another command that's currently being 
  // generated will overwrite the first stopVoice call.
  try {
    delete event_register[name];
    patterns_that_have_been_stopped[name] = true;
    setTimeout(()=>{delete event_register[name]},500);
    setTimeout(()=>{delete event_register[name]},1000);
    setTimeout(()=>{delete event_register[name]},1500);
    setTimeout(()=>{delete event_register[name]},2000);
    setTimeout(()=>{delete event_register[name]},2500);
    setTimeout(()=>{delete event_register[name]},3000);
  }
  catch (e) {}
}

function allocateVoice(posted_pattern) {
  let new_voice = new AudioPlaybackVoice(posted_pattern);
  // determine the voice number where new_voice can go
  let new_voice_found = false;
  let voice_checks = 0;
  while ( voice_checks < VOICES ) {
    // special check first - if the fp name split--- 0 is already set as a pattern. 
    // there can't be more than one voice with the same name at one time, so delete those
    // this is critical in the context of replacing old "kept" patterns instead of clogging up 
    // all the voices with kept patterns that aren't even being used anymore
    if ( voice_allocator[voice_checks] ) {
      if ( voice_allocator[voice_checks].name.split('---')[0] === posted_pattern.name.split('---')[0] ) {
        voice_allocator[voice_checks] = false;
      }
    }
    voice_checks++;
  }
  voice_checks = 0;
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
			if (voice_allocator[key].loops_since_generation >= voice_allocator[key].every && voice_allocator[key].every > 1 ) {
				voice_allocator[key] = false;
			}
		}
	}
}

function scalePatternToSteps(pattern, steps) {
  let result = [];
  let scale = steps / pattern.length;
  for (let i = 0; i < steps; i++) {
      let index = Math.floor(i / scale);
      result.push(pattern[index]);
  }
  return result;
}

class AudioPlaybackVoice {
	constructor(posted_pattern) {
		this.name = posted_pattern.name;
		this.every = posted_pattern.regenerate_every_n_loops;
    this.loops_since_generation = 0;
		this.once = posted_pattern.play_once;
		this.bpm = posted_pattern.bpm_at_generation_time;
		this.overwritable = posted_pattern.do_not_regenerate === true || posted_pattern.regenerate_every_n_loops > 1 ? false : true;
	}
}