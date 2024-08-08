const FacetPattern = require('./FacetPattern.js');
const { exec } = require('child_process');
const fs = require('fs');
const {WebMidi} = require('webmidi');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const axios = require('axios');
const FacetConfig = require('./config.js');
const HOST = FacetConfig.settings.HOST;
const OSC = require('osc-js')
const udp_osc_server = new OSC({ plugin: new OSC.DatagramPlugin({ send: { port: FacetConfig.settings.OSC_OUTPORT } }) })
const Tonal = require('tonal');
const { time } = require('console');
udp_osc_server.open({ port: 2134 });
const EVENT_RESOLUTION_MS = FacetConfig.settings.EVENT_RESOLUTION_MS;
const server = http.createServer(app);
let bars_elapsed = 0;
let bpm = 90;
let prev_bpm = 90;
let voice_number_to_load = 1;
let browser_sound_output = true;
let voice_allocator = initializeVoiceAllocator();
let voices_to_send_to_browser = [];
let patterns_for_next_loop = {};
let over_n_values = {};
let stopped_patterns = [];
let patterns_that_have_been_stopped = [];
let patterns_to_delete_at_end_of_loop = [];
let current_relative_step_position = 0;
let time_since_last_regen_request = Date.now();
let event_register = [];
let sockets = [];
let transport_on = true;
let meta_data = {
  bpm: [90]
};
process.title = 'facet_transport';

// attach Socket.IO to the HTTP server
const io = socketIo(server, {
  cors: {
    origin: "*", // allow all origins
    methods: ["GET", "POST"] // allow GET and POST
  }
});

// listen for new connections
io.on('connection', (socket) => {
  // new client connected
  sockets.push(socket);

  // send bpm and bars_elapsed every 20ms
  setInterval(() => {
    socket.emit('bpm', bpm);
    socket.emit('time_signature_numerator', time_signature_numerator);
    socket.emit('time_signature_denominator', time_signature_denominator);
    socket.emit('barsElapsed', bars_elapsed);
    socket.emit('progress', current_relative_step_position);
  }, 20);

  // listen for the client disconnecting
  socket.on('disconnect', () => {
    sockets = sockets.filter(s => s !== socket);
  });
});

// start the HTTP server
server.listen(3000, () => {});

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
    meta_data.bpm_over_n = posted_pattern.over_n;
  }
  if ( req.body.type == 'time_signature_numerator' ) {
    time_signature_numerator = posted_pattern.time_signature_numerator;
  }
  if ( req.body.type == 'time_signature_denominator' ) {
    time_signature_denominator = posted_pattern.time_signature_denominator;
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
    let facet_pattern_name = posted_pattern.name.split('---')[0];

    over_n_values[facet_pattern_name] = posted_pattern.over_n;

    if ( posted_pattern.is_stopped === true || facet_pattern_name in patterns_that_have_been_stopped ) {
      stopped_patterns.push(facet_pattern_name);
      stopVoice(posted_pattern.name);
      delete patterns_that_have_been_stopped[facet_pattern_name];
      return;
    }

    if ( posted_pattern.sequence_data.length > 0 ) {
      allocateVoice(posted_pattern);
      if ( browser_sound_output === true ) {
        voices_to_send_to_browser.push(`${voice_number_to_load} ${posted_pattern.name}.wav ${posted_pattern.bpm_at_generation_time}`);
      }
    
      let over_n = over_n_values[facet_pattern_name] || 1;
    
      event_register[facet_pattern_name] = [];
      posted_pattern.sequence_data.forEach((step, index) => {
        // calculate the ratio of sequence steps to pitch steps
        let ratio = posted_pattern.sequence_pitch_data.length / posted_pattern.sequence_data.length;
        // calculate the index in the pattern's sequence_pitch_data
        let pitchIndex = Math.floor(index * ratio) % posted_pattern.sequence_pitch_data.length;
        // get the pitch from the pattern's sequence_pitch_data
        let pitch = posted_pattern.sequence_pitch_data[pitchIndex];
    
        // calculate which loop this step belongs to
        let loopIndex = Math.floor(step * over_n);
        // calculate the position within the loop
        let newPosition = (step * over_n) - loopIndex;
        if (loopIndex < over_n) {
          event_register[facet_pattern_name].push(
            {
              position: newPosition,
              type: "audio",
              data: [],
              pitch: pitch,
              channels: posted_pattern.dacs,
              pan_data: posted_pattern.pan_data,
              play_once: posted_pattern.play_once,
              voice: voice_number_to_load,
              fired: false,
              loadtime: Date.now(),
              play_on_bar: loopIndex,
              over_n: posted_pattern.over_n,
              bar_posted: bars_elapsed
            }
          )
        }
      });
      emitLoadEvent();
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
  time_signature_numerator = req.body.time_signature_numerator;
  time_signature_denominator = req.body.time_signature_denominator;
  meta_data.bpm_over_n = 1;
  res.sendStatus(200);
});

app.post('/stop', (req, res) => {
  event_register = [];
  patterns_for_next_loop = {};
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
let bpm_was_changed_this_loop = false;
let time_signature_numerator = 4;
let time_signature_denominator = 4;

function tick() {
  let events_per_second = 1000 / EVENT_RESOLUTION_MS;
  let loops_per_minute = bpm / (time_signature_numerator / (time_signature_denominator / 4));
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
    // tell pattern server to start processing next loop
    requestNewPatterns();
    // increment loops since generation for all voices
    updateVoiceAllocator();
    // set all "fired" values to false at beginning of loop
    resetEventRegister();
    loop_start_time = Date.now();
    bpm_was_changed_this_loop = false;
  }

  checkForBpmRecalculation(events_per_loop);
  loops_per_minute = bpm / (time_signature_numerator / (time_signature_denominator / 4));
  seconds_per_loop = 60 / loops_per_minute;
  events_per_loop = seconds_per_loop * events_per_second;
  relative_step_amount_to_add_per_loop = 1 / events_per_loop;

  if ( transport_on === true ) {
    for (const [fp_name, fp_data] of Object.entries(event_register)) {
      let count_times_fp_played = 0;
      fp_data.forEach((event) => {
        if ( event.position >= current_relative_step_position
          && (event.position < (current_relative_step_position + relative_step_amount_to_add_per_loop) && (event.fired === false) ) ) {
            event.fired = true;
          // fire all events for this facetpattern matching the current step
          if ( event.type === "audio" && (((bars_elapsed - event.bar_posted) % event.over_n) == event.play_on_bar) ) {
            // play any audio files at this step
            if ( count_times_fp_played < 1 ) {
              let pre_send_delay_ms = 0;
              // osc event to play back audio file in browser
              setTimeout(()=>{
                if ( browser_sound_output === true ) {
                  emitPlayEvent(event);
                }
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
  expectedTime += EVENT_RESOLUTION_MS;

  // hard-reset loop position if bpm has been static for the entire loop and an entire loop of time has passed
  if ( bpm_was_changed_this_loop === false && Date.now() - loop_start_time > ((seconds_per_loop * 1000) - EVENT_RESOLUTION_MS) ) {
    delay = Math.round((seconds_per_loop * 1000) - (Date.now() - loop_start_time));
    current_relative_step_position = 1;
    loop_start_time = Date.now();
  }

  if ( current_relative_step_position >= 0.99 ) {
    applyNextPatterns();
  }

  setTimeout(tick, delay);
}

tick();

function reportTransportMetaData() {
  // pass along the current bpm and bars elapsed, if the transport is running
  if ( transport_on === true ) {
    axios.post(`http://${HOST}:1123/meta`,
    {
      bpm: JSON.stringify(bpm),
      bars_elapsed: JSON.stringify(bars_elapsed),
      time_signature_numerator: time_signature_numerator,
      time_signature_denominator: time_signature_denominator
    }
  )
  .catch(function (error) {
    console.log(`error posting metadata to pattern server: ${error}`);
  });
  }
}

function applyNextPatterns() {
  for (const [facet_pattern_name, posted_pattern] of Object.entries(patterns_for_next_loop)) {
    if (stopped_patterns.includes(facet_pattern_name)) {
      return;
    }

    let over_n = over_n_values[facet_pattern_name] || 1;

    const processPatternData = (patternData, type, processData) => {
      const eventsPerLoop = Math.ceil(patternData.length / over_n);
      const startEventIndex = bars_elapsed % over_n * eventsPerLoop;
      const endEventIndex = Math.min(startEventIndex + eventsPerLoop, patternData.length);

      event_register[facet_pattern_name] = [];
      for (let i = startEventIndex; i < endEventIndex; i++) {
        const indexWithinLoop = i - startEventIndex;
        const newPosition = indexWithinLoop / eventsPerLoop;

        let eventData = {
          position: newPosition,
          type: type,
          data: patternData[i],
          play_once: posted_pattern.play_once,
          fired: false
        };

        if (processData) {
          processData(eventData, i, indexWithinLoop);
        }

        event_register[facet_pattern_name].push(eventData);
      }
    };

    if (posted_pattern.notes && posted_pattern.notes.length > 0) {
      // process notes and associated chord intervals
      processPatternData(posted_pattern.notes, 'note', (eventData, noteIndex, indexWithinLoop) => {
        const note_data = eventData.data;
        const eventsPerLoop = Math.ceil(posted_pattern.notes.length / over_n);
        // push the root note
        event_register[facet_pattern_name].push({
          position: eventData.position,
          type: 'note',
          data: note_data
        });
    
        if (posted_pattern.chord_intervals && posted_pattern.chord_intervals.length > 0) {
          const chordIntervalsLength = posted_pattern.chord_intervals.length;
          
          // process chord intervals if available
          let chordIntervalIndex = Math.floor((indexWithinLoop / eventsPerLoop) * chordIntervalsLength);
          let currentChordInterval = posted_pattern.chord_intervals[chordIntervalIndex];
          
          if (currentChordInterval) {
            for (let c = 0; c < currentChordInterval.length; c++) {
              let note_to_add = note_data.note + currentChordInterval[c];
              event_register[facet_pattern_name].push({
                position: eventData.position,
                type: 'note',
                data: {
                  note: note_to_add,
                  channel: note_data.channel,
                  velocity: note_data.velocity,
                  duration: note_data.duration,
                  play_once: posted_pattern.play_once,
                  fired: false
                }
              });
            }
          }
        }
      });
    }

    if ( typeof posted_pattern.cc_data.data !== 'undefined' ) {
      let eventsPerLoop = Math.ceil(posted_pattern.cc_data.data.length / over_n);
      let startEventIndex = bars_elapsed % over_n * eventsPerLoop;
      let endEventIndex = startEventIndex + eventsPerLoop;
    
      event_register[facet_pattern_name] = [];
      for (var i = startEventIndex; i < endEventIndex && i < posted_pattern.cc_data.data.length; i++) {
        let cc_object = {
          data: posted_pattern.cc_data.data[i],
          controller: posted_pattern.cc_data.controller,
          channel: posted_pattern.cc_data.channel,
        };
        let indexWithinLoop = i - startEventIndex;
        let newPosition = indexWithinLoop / eventsPerLoop;
    
        event_register[facet_pattern_name].push(
          {
            position: newPosition,
            type: "cc",
            data: cc_object,
            play_once: posted_pattern.play_once,
            fired: false
          }
        )
      }
    }
    
    if ( typeof posted_pattern.pitchbend_data.data !== 'undefined' ) {
      let eventsPerLoop = Math.ceil(posted_pattern.pitchbend_data.data.length / over_n);
      let startEventIndex = bars_elapsed % over_n * eventsPerLoop;
      let endEventIndex = startEventIndex + eventsPerLoop;
    
      event_register[facet_pattern_name] = [];
      for (var i = startEventIndex; i < endEventIndex && i < posted_pattern.pitchbend_data.data.length; i++) {
        let pb_object = {
          data: posted_pattern.pitchbend_data.data[i],
          channel: posted_pattern.pitchbend_data.channel,
        };
        let indexWithinLoop = i - startEventIndex;
        let newPosition = indexWithinLoop / eventsPerLoop;
    
        event_register[facet_pattern_name].push(
          {
            position: newPosition,
            type: "pitchbend",
            data: pb_object,
            play_once: posted_pattern.play_once,
            fired: false
          }
        )
      }
    }
    
    if ( typeof posted_pattern.osc_data.data !== 'undefined' ) {
      let eventsPerLoop = Math.ceil(posted_pattern.osc_data.data.length / over_n);
      let startEventIndex = bars_elapsed % over_n * eventsPerLoop;
      let endEventIndex = startEventIndex + eventsPerLoop;
    
      event_register[facet_pattern_name] = [];
      for (var i = startEventIndex; i < endEventIndex && i < posted_pattern.osc_data.data.length; i++) {
        let osc_object = {
          data: posted_pattern.osc_data.data[i],
          address: posted_pattern.osc_data.address,
        };
        let indexWithinLoop = i - startEventIndex;
        let newPosition = indexWithinLoop / eventsPerLoop;
    
        event_register[facet_pattern_name].push(
          {
            position: newPosition,
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
  if ( bars_elapsed > 0 && Date.now() - time_since_last_regen_request > 500 ) {
    // tell server to generate any new patterns
    axios.get(`http://${HOST}:1123/update`);
    time_since_last_regen_request = Date.now();
  }
}

function resetEventRegister() {
  for (const [fp_name, fp_data] of Object.entries(event_register)) {
    for (let i = 0; i < event_register[fp_name].length; i++) {
      event_register[fp_name][i].fired = false;
    }
  }
}

function checkForBpmRecalculation(events_per_loop) {
  scaledBpm = scalePatternToSteps(meta_data.bpm, events_per_loop);
  // calculate the total length of the BPM pattern over meta_data.bpm_over_n loops
  let totalPatternLength = events_per_loop * meta_data.bpm_over_n;
  scaledBpm = scalePatternToSteps(meta_data.bpm, totalPatternLength);

  // find the overall position in the cycle, combining bars_elapsed and current_relative_step_position
  // normalize the current_relative_step_position between 0 (inclusive) and 1 (exclusive)
  let normalizedStepPosition = current_relative_step_position % 1;
  // calculate the position within the entire cycle
  let cyclePosition = bars_elapsed / meta_data.bpm_over_n + normalizedStepPosition / meta_data.bpm_over_n;
  // ensure the cyclePosition wraps around properly
  cyclePosition = cyclePosition % 1;

  // use the cyclePosition to find the index in the scaled BPM pattern
  let bpmIndex = Math.floor(cyclePosition * totalPatternLength);

  if (typeof scaledBpm[bpmIndex] !== 'undefined') {
    bpm = scaledBpm[bpmIndex];
  }

  if (prev_bpm !== bpm) {
    bpm_was_changed_this_loop = true;
    prev_bpm = bpm;
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
  voice_number_to_load++;
  voice_allocator[voice_number_to_load] = new_voice;
}

function initializeVoiceAllocator() {
	let obj = {};
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

function emitLoadEvent() {
  for (let socket of sockets) {
    socket.emit('load', voices_to_send_to_browser);
  }
  voices_to_send_to_browser = [];
}

function emitPlayEvent(event) {
  let voice = event.voice;
  let pitch = event.pitch;
  let channels = event.channels;
  let pan_data = event.pan_data;
  for (let socket of sockets) {
    socket.emit('play', { voice: voice, pitch: pitch, channels: channels, pan_data: pan_data });
  }
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