const { exec } = require('child_process');
const {Worker} = require('worker_threads');
const { spawn } = require('child_process');
const find = require('find-process');
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const frontEndWebApp = express();
const cors = require('cors');
const OSC = require('osc-js');
const fs = require('fs');
const WaveFile = require('wavefile').WaveFile;
const wav = require('node-wav');
const sound = require('./lib/play_sound.js');
const FacetPattern = require('./FacetPattern.js');
const easymidi = require('easymidi');
const open = require('open');
const osc = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
osc.open();
let midioutput = new easymidi.Output(easymidi.getOutputs()[0]);
let bpm = 90;
let steps = 16;
let transport_on = true;
let current_step = 1;
let cycles_elapsed = 0;
let global_speed = ((60000 / bpm) / steps) * 4;
let speed = global_speed;
repeater = setInterval(repeaterFn, global_speed);

const child = spawn('pwd');

function noteoff(note,channel) {
  if ( typeof midioutput !== 'undefined' ) {
    midioutput.send('noteoff', {
      note: note,
      velocity: 0,
      channel: channel
    });
  }
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

function repeaterFn() {
  if ( transport_on !== false) {
    // main stepping loop
    let prev_step = current_step-1;
    for (const [hook_key, hook] of Object.entries(module.exports.hooks)) {
        if ( (Number(hook_key) >= ((prev_step) / steps) && Number(hook_key) < ((current_step+1) / steps))
          &&  module.exports.muteHooks == false ) {
          hook.forEach(h => {
            // only run hook when cycles_elapsed % every == 0
            if ( cycles_elapsed % h.every == 0 ) {
              module.exports.run(h.command,true);
            }
          });
        }
    }

    // begin looping through all facet patterns, looking for wavs/notes/CCs to play
    for (const [k, fp] of Object.entries(module.exports.facet_patterns)) {
      for (var j = 0; j < fp.sequence_data.length; j++) {
        // sequence data is from 0-1 so it gets scaled into the step range at run time.
        let sequence_step = Math.round(fp.sequence_data[j] * (steps-1)) + 1;
        if (current_step == sequence_step) {
          try {
            sound.play(`tmp/${fp.name}.wav`,1);
            if ( fp.sequence_data.length == 1 ) {
              delete module.exports.facet_patterns[k];
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
      for (const [k, fp] of Object.entries(module.exports.facet_patterns)) {
        if ( fp.loop_has_occurred === true && fp.looped === false ) {
          // delete sequences set via .play() instead of .repeat(), after one cycle
          delete module.exports.facet_patterns[k];
        }
        fp.loop_has_occurred = true;
      }
      cycles_elapsed++;
    }
    else {
      current_step++;
    }
    global_speed = ((60000 / bpm) / steps) * 4;
    if ( speed != global_speed ) {
     clearInterval(repeater);
     speed = global_speed;
     repeater = setInterval(repeaterFn, global_speed);
    }
  }
}

module.exports = {
  addAnyHooks: (fp, hook_mode, command) => {
    if (!hook_mode) {
      if ( fp.hooks.length > 0 ) {
        for (var i = 0; i < fp.hooks.length; i++) {
          if ( !module.exports.hooks[fp.hooks[i][0]] ) {
            module.exports.hooks[fp.hooks[i][0]] = [];
          }
          module.exports.hooks[fp.hooks[i][0]].push({command:command,every:fp.hooks[i][1]});
        }
      }
    }
  },

  // TODO this doesnt work on windows- would need to differentiate user OS and
  // check PID in windows commands
  checkIfOverloaded: () => {
    exec(`ps -p ${module.exports.pid} -o %cpu`, (error, stdout, stderr) => {
      if ( typeof stdout == 'string' ) {
        let percent_cpu = Number(stdout.split('\n')[1].trim());
        osc.send(new OSC.Message('/cpu', percent_cpu));
      }
    });
  },

  facet_patterns: {},

  hooks: {},

  setPID: () => {
    find('port', 1123)
      .then(function (list) {
        if (!list.length) {
          // do nothing
        } else {
          module.exports.pid = list[0].pid;
        }
      });
  },

  initEnv: () => {
    fs.writeFileSync('js/env.js', '');
  },

  initStore: () => {
    fs.writeFileSync('js/stored.json', '{}');
  },

  muteHooks: false,

  pid: '',

  run: (code, hook_mode) => {
    const worker = new Worker("./js/run.js", {workerData: {code: code, hook_mode: hook_mode, vars: {}}});
    worker.once("message", fps => {
        Object.values(fps).forEach(fp => {
          if ( typeof fp == 'object' ) {
            module.exports.addAnyHooks(fp, hook_mode, fp.original_command);
            if ( fp.skipped !== true ) {
              // if the data is somehow not numeric due to a bug, do not continue
              if ( !isNaN(fp.data[0]) ) {
                // create a mono wave file, 44.1 kHz, 32-bit floating point, with the entire request body of numbers
                module.exports.storeAnyPatterns(fp);
                let a_wav = new WaveFile();
                a_wav.fromScratch(1, 44100, '32f', fp.data);
                // store the wav in /tmp/ for access in Max
                fs.writeFile(`tmp/${fp.name}.wav`, a_wav.toBuffer(),(err) => {
                  // add to list of available samples for sequencing
                  module.exports.facet_patterns[fp.name] = fp;
                });
              }
            }
          }
        });
    });
    worker.on("error", error => {
      osc.send(new OSC.Message('/errors', error.toString()));
    });
  },

  storeAnyPatterns: (fp) => {
    if ( fp.store.length > 0 ) {
      for (var i = 0; i < fp.store.length; i++) {
        module.exports.stored[fp.store[i]] = fp.data;
        fs.writeFileSync('js/stored.json', JSON.stringify(module.exports.stored),()=> {});
      }
    }
  },

  stored: {}
}

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

module.exports.initEnv();
module.exports.initStore();

// make the tmp/ directory if it doesn't exist
if ( !fs.existsSync('tmp/')) {
    fs.mkdirSync('tmp/');
};

// receive and run commands via HTTP POST
app.post('/', (req, res) => {
  module.exports.run(req.body.code, false);
  res.send({
    status: 200,
  });
});

app.post('/midi', (req, res) => {
  res.send({
    data:easymidi.getOutputs()
  });
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

// global mute request via ctrl+m in the browser
app.post('/mute', (req, res) => {
  transport_on = false;
  module.exports.facet_patterns = {};
  res.sendStatus(200);
});

app.post('/status', (req, res) => {
  // stores any environment variables that might be needed in any future eval statements in a file that is loaded into the FacetPattern
  // instance when it's constructed
  fs.writeFileSync('js/env.js', `var mousex=${req.body.mousex};var mousey=${req.body.mousey};`,()=> {});
  res.sendStatus(200);
});

app.post('/play', (req, res) => {
  transport_on = true;
  res.sendStatus(200);
});

// mute all hooks request via ctrl+f in the browser
app.post('/hooks/mute', (req, res) => {
  if ( module.exports.muteHooks == true ) {
    module.exports.muteHooks = false;
  }
  else {
    module.exports.muteHooks = true;
  }
  res.send({
    muted: module.exports.muteHooks
  });
});

// clear all hooks request via ctrl+c in the browser
app.post('/hooks/clear', (req, res) => {
  module.exports.hooks = {};
  res.send({
    cleared: true
  });
});

// run the server
const server = app.listen(1123);
// find its PID
module.exports.setPID();
// check that every 500ms it's not overloaded - so that superfluous hook events can be prevented from stacking up
setInterval(module.exports.checkIfOverloaded, 500);

frontEndWebApp.use(express.static(path.join(__dirname, '../')))

const frontEndServer = frontEndWebApp.listen(1124)

open('http://localhost:1124/');

//do something when app is closing
process.on('exit', ()=>{fs.writeFileSync('js/stored.json', '{}');fs.writeFileSync('js/env.js', '');process.exit()});

//catches ctrl+c event
process.on('SIGINT', ()=>{fs.writeFileSync('js/stored.json', '{}');fs.writeFileSync('js/env.js', '');process.exit()});
