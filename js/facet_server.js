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
let reruns = {};

module.exports = {
  cleanUp: () => {
    fs.writeFileSync('js/stored.json', '{}');
    fs.writeFileSync('js/reruns.json', '{}');
    fs.writeFileSync('js/patterns.json', '{}');
    fs.writeFileSync('js/hooks.json', '{}');
    fs.writeFileSync('js/env.js', '');
    fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  },
  initEnv: () => {
    fs.writeFileSync('js/env.js', '');
  },
  initStore: () => {
    fs.writeFileSync('js/stored.json', '{}');
  },
  run: (code, hook_mode) => {
    const worker = new Worker("./js/run.js", {workerData: {code: code, hook_mode: hook_mode, vars: {}}});
    worker.once("message", fps => {
        Object.values(fps).forEach(fp => {
          if ( hook_mode === false) {
            reruns[fp.name] = code;
          }
          if ( typeof fp == 'object' && fp.skipped !== true && !isNaN(fp.data[0]) ) {
            // create wav file, 44.1 kHz, 32-bit floating point
            storeAnyPatterns(fp);
            let a_wav = new WaveFile();
            a_wav.fromScratch(1, 44100, '32f', fp.data);
            // store wav file in /tmp/
            fs.writeFile(`tmp/${fp.name}.wav`, a_wav.toBuffer(),(err) => {
              // remix onto whatever channels via SoX
              let speed = 1;
              if ( fp.output_size != -1 ) {
                // if a .size() was specified, upscale or downscale the file
                // to that number of samples via the SoX speed function
                speed = fp.data.length / fp.output_size;
              }
              if ( fp.dacs == '1' ) {
                // by default, channels 1 and 2 are on. If _only_ channel 1 was
                // specified via .channel(), turn off channel 2.
                fp.dacs = '1 0';
              }
              exec(`sox tmp/${fp.name}.wav tmp/${fp.name}-out.wav speed ${speed} rate -q remix ${fp.dacs}`, (error, stdout, stderr) => {
                facet_patterns[fp.name] = fp;
                axios.post('http://localhost:3211/update',
                  {
                    facet_patterns: JSON.stringify(facet_patterns)
                  }
                )
                .catch(function (error) {
                  console.log(`error posting to transport server: ${error}`);
                });
              });
            });
          }
        });
    });
    worker.on("error", error => {
      osc.send(new OSC.Message('/errors', error.toString()));
    });
  }
}

osc.open();
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
  module.exports.run(req.body.code,false);
  res.send({
    status: 200,
  });
});

app.post('/hooks/clear', (req, res) => {
  reruns = {};
  res.sendStatus(200);
});

app.post('/mute', (req, res) => {
  facet_patterns = {};
  reruns = {};
  res.sendStatus(200);
});

app.post('/status', (req, res) => {
  // rewrite env.js, the environment variables that can be accessed in all future evals.
  // it's loaded into each FacetPattern instance on consruction
  fs.writeFileSync('js/env.js',
    calculateNoteValues(req.body.bpm) +
    `var bpm=${req.body.bpm};var mousex=${req.body.mousex};var mousey=${req.body.mousey};`,
    ()=> {}
  );
  res.sendStatus(200);
});

app.get('/update', (req, res) => {
  for (const [fp_name, code] of Object.entries(reruns)) {
    module.exports.run(code, true);
  }
  res.sendStatus(200);
});

// run the server
const server = app.listen(1123);
// find the PID and continually re-check CPU usage every 500ms
setPID();
setInterval(getCpuUsage, 500);

// initialize and open a window in the browser with the text editor
frontEndWebApp.use(express.static(path.join(__dirname, '../')));
const frontEndServer = frontEndWebApp.listen(1124);
open('http://localhost:1124/');

// do stuff when app is closing
process.on('exit', () => {
  module.exports.cleanUp();
  process.exit()
});

// catches ctrl+c event
process.on('SIGINT', () => {
  module.exports.cleanUp();
  process.exit()
});

// TODO I'm guessing this doesn't work on windows- would need to differentiate user OS and check PID in windows commands
function getCpuUsage () {
  exec(`ps -p ${pid} -o %cpu`, (error, stdout, stderr) => {
    if ( typeof stdout == 'string' ) {
      let percent_cpu = Number(stdout.split('\n')[1].trim());
      osc.send(new OSC.Message('/cpu', percent_cpu));
    }
  });
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

function calculateNoteValues(bpm) {
  let out = '';
  for (var i = 1; i <= 128; i++) {
    let calculated_nv = Math.round((((60000/bpm)/i)*4)*44.1);
    out += `var n${i} = ${calculated_nv};`
  }
  return out;
}
