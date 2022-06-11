const { exec } = require('child_process');
const find = require('find-process');
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const cors = require('cors');
const OSC = require('osc-js');
const fs = require('fs');
const WaveFile = require('wavefile').WaveFile;
const wav = require('node-wav');
const commentStripper = require('./lib/strip_comments.js');
const FacetPattern = require('./FacetPattern.js')
const easymidi = require('easymidi');
const osc = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
osc.open();
let utils = fs.readFileSync('js/utils.js', 'utf8', (err, data) => {return data});
let midioutput = easymidi.getOutputs()[0];
let bpm = 90;
let steps = 32;
let current_step = 1;
let global_speed = (60000 / bpm) / steps;
let speed = global_speed;
repeater = setInterval(repeaterFn, global_speed);

function noteoff(note,channel) {
  midioutput.send('noteoff', {
    note: note,
    velocity: 0,
    channel: channel
  });
}

function scalePatternToSteps(pattern,steps) {
  let fp = new FacetPattern();
  // scale note pattern onto a bar of length _steps_.
  if (pattern.length < steps ) {
    // upscale
    let upscaled_data = new Array(steps).fill(-1);
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
function repeaterFn() {
  // main stepping loop
  if ( module.exports.hooks[current_step] && module.exports.muteHooks == false ) {
    for (var i = 0; i < module.exports.hooks[current_step].length; i++) {
      module.exports.runCode(module.exports.hooks[current_step][i],true);
    }
  }

  // begin looping through all facet patterns, looking for wavs/notes/CCs to play
  Object.values(module.exports.facet_patterns).forEach(fp => {
    for (var j = 0; j < fp.sequence_data.length; j++) {
      // sequence data is from 0-1 so it gets scaled into the step range at run time.
      let sequence_step = Math.floor(fp.sequence_data[j] * (steps-1)) + 1;
      if (current_step == sequence_step) {
        exec(`afplay tmp/${fp.name}.wav -r ${fp.phasor_speed} -q 1`);
      }
    }

    // MIDI note logic
    let prev_velocity, prev_duration;
    for (var j = 0; j < fp.notes.length; j++) {
      let note = fp.notes[j];
      let note_fp = scalePatternToSteps(note.data,steps);
      let velocity_fp, duration_fp;

      if (note.velocity.data.length == 1 ) {
        // if velocity is a single number, make all velocities that number
        velocity_fp = new FacetPattern().from(new Array(steps).fill(note.velocity.data[0]));
      }
      else {
        // otherwise scale the velocity FacetPattern to match the number of global steps
        velocity_fp = scalePatternToSteps(note.velocity.data,steps);
      }
      if (note.duration.data.length == 1 ) {
        // if duration is a single number, make all durations that number
        duration_fp = new FacetPattern().from(new Array(steps).fill(note.duration.data[0]));
      }
      else {
        // otherwise scale the duration FacetPattern to match the number of global steps
        duration_fp = scalePatternToSteps(note.duration.data,steps);
      }

      for (var i = 0; i < note_fp.data.length; i++) {
        if ( current_step == i+1 ) {
          if ( note_fp.data[i] == -1 || isNaN(note_fp.data[i])) {
            continue;
          }
          // generate MIDI note on/off pair for this step
          let n = note_fp.data[i];
          let v = velocity_fp.data[i];
          let d = duration_fp.data[i];
          let c = note.channel;
          try {
            midioutput.send('noteon', {
              note:n,
              velocity:v,
              channel:c
            });
            setTimeout(() => {
              noteoff(n,c);
            },d);
          } catch (e) {}
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
          midioutput.send('cc', {
            controller: cc.controller,
            value: value,
            channel: 0
          })
        }
      }
    }
  });

  if ( current_step >= steps ) {
    current_step = 1;
  }
  else {
    current_step++;
  }
  global_speed = (60000 / bpm) / steps;
  if ( speed != global_speed ) {
   clearInterval(repeater);
   speed = global_speed;
   repeater = setInterval(repeaterFn, global_speed);
  }
}

module.exports = {
  addAnyHooks: (fp, hook_mode, command) => {
    if (!hook_mode) {
      if ( fp.hooks.length > 0 ) {
        for (var i = 0; i < fp.hooks.length; i++) {
          if ( !module.exports.hooks[fp.hooks[i]] ) {
            module.exports.hooks[fp.hooks[i]] = [];
          }
          module.exports.hooks[fp.hooks[i]].push(command);
        }
      }
    }
  },

  checkIfOverloaded: () => {
    exec(`ps -p ${module.exports.pid} -o %cpu`, (error, stdout, stderr) => {
      if ( typeof stdout == 'string' ) {
        let percent_cpu = Number(stdout.split('\n')[1].trim());
        osc.send(new OSC.Message('/cpu', percent_cpu));
        if ( percent_cpu > 70 ) {
          module.exports.isOverloaded = true;
        }
        else {
          module.exports.isOverloaded = false;
        }
      }
    });
  },

  facet_patterns: {},

  getCommands: (user_input) => {
     return user_input.trim().split(';').filter(Boolean);
  },

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

  initStore: () => {
    fs.writeFileSync('js/stored.json', '{}');
  },

  isOverloaded: false,

  muteHooks: false,

  pid: '',

  removeTabsAndNewlines: (user_input) => {
    user_input = user_input.replace(/\s\s+/g, '');
    user_input = user_input.replace(/\'/g, '"');
    user_input = user_input.replace(/;/g, ';\n');
    return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
  },

  runCode: (code, hook_mode = false) => {
    // parse user input into individual operations on data.
    // run those operations, scale and flatten the resulting array,
    // and send that data into Max so it can go in a buffer wavetable
    user_input = commentStripper.stripComments(code);
    let commands = module.exports.getCommands(code);
    Object.values(commands).forEach(command => {
      let original_command = command;
      command = module.exports.removeTabsAndNewlines(command);
      let fp = eval(utils + command);
      if ( typeof fp == 'object' && fp.constructor.name == 'FacetPattern' ) {
        module.exports.addAnyHooks(fp, hook_mode, original_command);
        if ( fp.skipped !== true ) {
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
    });
  },

  storeAnyPatterns: (fp) => {
    if ( fp.store.length > 0 ) {
      for (var i = 0; i < fp.store.length; i++) {
        module.exports.stored[fp.store[i]] = fp.data;
        fs.writeFileSync('js/stored.json', JSON.stringify(module.exports.stored));
      }
    }
  },

  stored: {}
}

const handlers = {
  hook: (...args) => {
    if (!module.exports.isOverloaded===true) {
      if ( module.exports.hooks[args[0]] && module.exports.muteHooks == false ) {
        for (var i = 0; i < module.exports.hooks[args[0]].length; i++) {
          module.exports.runCode(module.exports.hooks[args[0]][i],true);
          osc.send(new OSC.Message('/hook', module.exports.hooks[args[0]][i]));
        }
      }
    }
  },
  set: (...args) => {
    global[args[0]] = args[1];
  },
  close: (...args) => {
      // remove all files in the facet/tmp/ directory on close of facet_server max object.
      let directory = '../tmp/';
      fs.readdir(directory, (err, files) => {
        if (err) throw err;
        for (const file of files) {
          fs.unlink(path.join(directory, file), err => {
            if (err) throw err;
          });
        }
      });
      // clear any stored patterns
      module.exports.initStore();
  }
};

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

module.exports.initStore();

// make the ../tmp/ directory if it doesn't exist
if ( !fs.existsSync('tmp/')) {
    fs.mkdirSync('tmp/');
};

// receive and run commands via HTTP POST
app.post('/', (req, res) => {
  try {
    module.exports.runCode(req.body.code);
    res.send({
      success: true
    });
  } catch (e) {
    res.send({
      status: 400,
      error: `${e}, command: ${req.body.code}`
    });
  }
});

app.post('/midi', (req, res) => {
  res.send({
    data:easymidi.getOutputs()
  });
});

app.post('/midi_select', (req, res) => {
  midioutput = new easymidi.Output(req.body.output);
  res.sendStatus(200);
});

// global mute request via ctrl+m in the browser
app.post('/mute', (req, res) => {
  module.exports.facet_patterns = {};
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
app.listen(1123);
// find its PID
module.exports.setPID();
// check that every 500ms it's not overloaded - so that superfluous hook events can be prevented from stacking up
setInterval(module.exports.checkIfOverloaded, 500);
