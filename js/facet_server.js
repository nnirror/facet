const { exec } = require('child_process');
const {Worker} = require('worker_threads');
const find = require('find-process');
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const axios = require('axios');
const app = express();
const frontEndWebApp = express();
const cors = require('cors');
const fs = require('fs');
const wav = require('node-wav');
const easymidi = require('easymidi');
const open = require('open');
const OSC = require('osc-js');
const WaveFile = require('wavefile').WaveFile;
const FacetPattern = require('./FacetPattern.js');
const osc = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
let pid;
let stored = {};
let facet_patterns = {};
let hooks = {};
let reruns = {};

module.exports = {
  run: (code, hook_mode) => {
    const worker = new Worker("./js/run.js", {workerData: {code: code, hook_mode: hook_mode, vars: {}}});
    worker.once("message", fps => {
        Object.values(fps).forEach(fp => {
          if ( typeof fp == 'object' && fp.skipped !== true && !isNaN(fp.data[0]) ) {
            // create wav file, 44.1 kHz, 32-bit floating point
            storeAnyPatterns(fp);
            let a_wav = new WaveFile();
            let wav_channel_data = [];
            let max_channel = fp.dacs.sort(function(a, b) {
              return a - b;
            });

            for (var i = 0; i < max_channel[max_channel.length-1]; i++) {
              // set data on matching channels
              if ( fp.dacs.includes(i+1) ) {
                wav_channel_data[i] = fp.data;
              }
              else {
              // otherwise fill with 0s
                wav_channel_data[i] = new Array(fp.data.length).fill(0);
              }
            }
            // create an explicit left-only stereo file if channel 1 was explicitly assigned
            if ( max_channel == 1 ) {
              wav_channel_data[1] = new Array(fp.data.length).fill(0);
            }

            a_wav.fromScratch(wav_channel_data.length, 44100, '32f', wav_channel_data);
            // store wav file in /tmp/
            fs.writeFile(`tmp/${fp.name}.wav`, a_wav.toBuffer(),(err) => {
              // add to list of available samples for sequencing
              facet_patterns[fp.name] = fp;
            });
            addAnyHooks(fp, hook_mode, fp.original_command);
            fs.writeFileSync('js/patterns.json', JSON.stringify(facet_patterns),()=> {});
            fs.writeFileSync('js/hooks.json', JSON.stringify(hooks),()=> {});
          }
        });
        // tell the :3211 transport server to reload hooks and patterns
        axios.get('http://localhost:3211/update')
    });
    worker.on("error", error => {
      osc.send(new OSC.Message('/errors', error.toString()));
    });
  }
}

osc.open();
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());
initEnv();
initStore();

// make the tmp/ directory if it doesn't exist
if ( !fs.existsSync('tmp/')) {
    fs.mkdirSync('tmp/');
};

// receive and run commands via HTTP POST
app.post('/', (req, res) => {
  module.exports.run(req.body.code,false);
  res.send({
    status: 200,
  });
});

app.post('/hooks/clear', (req, res) => {
  hooks = {};
  res.sendStatus(200);
});

app.get('/reruns', (req, res) => {
  reruns = getReruns();
  for (var i = 0; i < reruns.length; i++) {
    module.exports.run(reruns[i],true);
  }
  res.sendStatus(200);
});

app.post('/mute', (req, res) => {
  facet_patterns = {};
  res.sendStatus(200);
});

app.post('/status', (req, res) => {
  // stores any environment variables that might be needed in any future eval statements in a file that is loaded into the FacetPattern
  // instance when it's constructed
  fs.writeFileSync('js/env.js', `var mousex=${req.body.mousex};var mousey=${req.body.mousey};`,()=> {});
  res.sendStatus(200);
});

// run the server
const server = app.listen(1123);
// find its PID
setPID();
// check that every 500ms it's not overloaded - so that superfluous hook events can be prevented from stacking up
setInterval(checkIfOverloaded, 500);

frontEndWebApp.use(express.static(path.join(__dirname, '../')))

const frontEndServer = frontEndWebApp.listen(1124)

open('http://localhost:1124/');

// do stuff when app is closing
process.on('exit', () => {
  fs.writeFileSync('js/stored.json', '{}');
  fs.writeFileSync('js/patterns.json', '{}');
  fs.writeFileSync('js/hooks.json', '{}');
  fs.writeFileSync('js/env.js', '');
  fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  process.exit()
});

// catches ctrl+c event
process.on('SIGINT', () => {
  fs.writeFileSync('js/stored.json', '{}');
  fs.writeFileSync('js/patterns.json', '{}');
  fs.writeFileSync('js/hooks.json', '{}');
  fs.writeFileSync('js/env.js', '');
  fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  process.exit()
});

function addAnyHooks (fp, hook_mode, command) {
  if (!hook_mode) {
    if ( fp.hooks.length > 0 ) {
      for (var i = 0; i < fp.hooks.length; i++) {
        if ( !hooks[fp.hooks[i][0]] ) {
          hooks[fp.hooks[i][0]] = [];
        }
        hooks[fp.hooks[i][0]].push({command:command,every:fp.hooks[i][1]});
      }
    }
  }
}

// TODO I'm guessing this doesn't work on windows- would need to differentiate user OS and check PID in windows commands
function checkIfOverloaded () {
  exec(`ps -p ${pid} -o %cpu`, (error, stdout, stderr) => {
    if ( typeof stdout == 'string' ) {
      let percent_cpu = Number(stdout.split('\n')[1].trim());
      osc.send(new OSC.Message('/cpu', percent_cpu));
    }
  });
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

function getReruns() {
  try {
    return JSON.parse(fs.readFileSync('js/reruns.json', 'utf8', (err, data) => {
      return data
    }));
  } catch (e) {
    return {};
  }
}

function initEnv () {
  fs.writeFileSync('js/env.js', '');
}

function initStore () {
  fs.writeFileSync('js/stored.json', '{}');
}

function setPID () {
  find('port', 1123)
    .then(function (list) {
      if (!list.length) {
        // do nothing
      } else {
        pid = list[0].pid;
      }
    });
}

function storeAnyPatterns (fp) {
  if ( fp.store.length > 0 ) {
    for (var i = 0; i < fp.store.length; i++) {
      stored[fp.store[i]] = fp.data;
      fs.writeFileSync('js/stored.json', JSON.stringify(stored),()=> {});
    }
  }
}
