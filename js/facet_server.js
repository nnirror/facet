const { exec } = require('child_process');
const find = require('find-process');
const path = require('path');
const Max = require('max-api');
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
const osc = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
osc.open();
let utils = fs.readFileSync('utils.js', 'utf8', (err, data) => {return data});

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
      let percent_cpu = Number(stdout.split('\n')[1].trim());
      osc.send(new OSC.Message('/cpu', percent_cpu));
      if ( percent_cpu > 70 ) {
        module.exports.isOverloaded = true;
      }
      else {
        module.exports.isOverloaded = false;
      }
    });
  },

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
    fs.writeFileSync('stored.json', '{}');
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
    if (commands[0] == 'mute()') {
      Max.outlet(`global mute`);
    }
    else {
      Object.values(commands).forEach(command => {
        let original_command = command;
        command = module.exports.removeTabsAndNewlines(command);
        let fp = eval(utils + command);
        module.exports.addAnyHooks(fp, hook_mode, original_command);
        if ( fp.skipped === true || typeof fp == 'undefined' ) {
          // do nothing
        }
        else {
          module.exports.storeAnyPatterns(fp);
          let s_wav = new WaveFile();
          let a_wav = new WaveFile();
          // first check if a speed file exists - if not, create it
          s_wav.fromScratch(1, 44100, '32f', fp.phasor_speed);
          fs.writeFile(`../tmp/${fp.name}_speed.wav`, s_wav.toBuffer(),(err) => {});
          // now create a mono wave file, 44.1 kHz, 32-bit floating point, with the entire request body of numbers
          a_wav.fromScratch(1, 44100, '32f', fp.data);
          // store the wav in /tmp/ for access in Max
          fs.writeFile(`../tmp/${fp.name}_data.wav`, a_wav.toBuffer(),(err) => {
            // file written successfully - send an update/speed command out so the facet_param object can read the new data for this dest/prop
            Max.outlet(`update ${fp.name}_data`);
            Max.outlet(`speed ${fp.name}`);
          });
        }
      });
    }
  },

  storeAnyPatterns: (fp) => {
    if ( fp.store.length > 0 ) {
      for (var i = 0; i < fp.store.length; i++) {
        module.exports.stored[fp.store[i]] = fp.data;
        fs.writeFileSync('stored.json', JSON.stringify(module.exports.stored));
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

Max.addHandlers(handlers);

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

module.exports.initStore();

// make the ../tmp/ directory if it doesn't exist
if ( !fs.existsSync('../tmp/')) {
    fs.mkdirSync('../tmp/');
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

// global mute request via ctrl+m in the browser
app.post('/mute', (req, res) => {
  Max.outlet(`global mute`);
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
