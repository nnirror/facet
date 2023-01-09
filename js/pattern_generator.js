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
const os_utils = require('os-utils');
const wav = require('node-wav');
const open = require('open');
const OSCPACKAGE = require('osc-js');
const WaveFile = require('wavefile').WaveFile;
const FacetPattern = require('./FacetPattern.js');
const FacetConfig = require('./config.js');
const FACET_SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
const osc_package = new OSCPACKAGE({
  discardLateMessages: false,
  plugin: new OSCPACKAGE.WebsocketServerPlugin()
});
let stored = {};
let reruns = {};
let percent_cpu = 0;
let cross_platform_move_command = process.platform == 'win32' ? 'move' : 'mv';
let cross_platform_slash = process.platform == 'win32' ? '\\' : '/';
process.title = 'facet_pattern_generator';

axios.interceptors.request.use(request => {
    request.maxContentLength = Infinity;
    request.maxBodyLength = Infinity;
    return request;
})

module.exports = {
  cleanUp: () => {
    fs.writeFileSync('js/stored.json', '{}');
    fs.writeFileSync('js/env.js', '');
    fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  },
  initEnv: () => {
    fs.writeFileSync('js/env.js', '');
  },
  initStore: () => {
    fs.writeFileSync('js/stored.json', '{}');
  },
  run: (code) => {
    if ( percent_cpu < 100 ) {
      const worker = new Worker("./js/run.js", {workerData: {code: code, vars: {}}});
      worker.once("message", fps => {
          Object.values(fps).forEach(fp => {
            if ( fp.do_not_regenerate === false ) {
              // don't add to reruns if it's meant to not regenerate via .keep()
              reruns[fp.name] = fp.original_command;
            }
            if ( fp.bpm_pattern !== false ) {
              postMetaDataToTransport(fp.bpm_pattern,'bpm');
            }
            if ( fp.steps_pattern !== false ) {
              postMetaDataToTransport(fp.steps_pattern,'steps');
            }
            if ( typeof fp == 'object' && fp.skipped !== true && !isNaN(fp.data[0]) ) {
              // create wav file at FACET_SAMPLE_RATE, 32-bit floating point
              storeAnyPatterns(fp);
              let a_wav = new WaveFile();
              a_wav.fromScratch(1, FACET_SAMPLE_RATE, '32f', fp.data);
              // store wav file in /tmp/
              fs.writeFile(`tmp/${fp.name}.wav`, a_wav.toBuffer(),(err) => {
                // remix onto whatever channels via SoX
                if ( fp.dacs == '1' ) {
                  // by default, channels 1 and 2 are on. If _only_ channel 1 was
                  // specified via .channel(), turn off channel 2.
                  fp.dacs = '1 0';
                }
                if ( fp.sequence_data.length > 0 ) {
                  if ( fp.dacs == '1 1' ) {
                    // no channel processing needed
                    exec(`${cross_platform_move_command} tmp${cross_platform_slash}${fp.name}.wav tmp${cross_platform_slash}${fp.name}-out.wav`, (error, stdout, stderr) => {
                      postToTransport(fp);
                    });
                  }
                  else {
                    // run audio data through SoX, adding channels
                    exec(`sox tmp${cross_platform_slash}${fp.name}.wav tmp${cross_platform_slash}${fp.name}-out.wav speed 1 rate -q remix ${fp.dacs}`, (error, stdout, stderr) => {
                      postToTransport(fp);
                    });
                  }
                }
                else {
                  postToTransport(fp);
                }
              });
            }
          });
      });
      worker.on("error", error => {
        osc_package.send(new OSCPACKAGE.Message('/errors', error.toString()));
      });
    }
  }
}

osc_package.open();
app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));
app.use(bodyParser.json({limit: '1000mb'}));
app.use(cors());
module.exports.initEnv();
module.exports.initStore();

// make the tmp/ directory if it doesn't exist
if ( !fs.existsSync('tmp/')) {
    fs.mkdirSync('tmp/');
};

// receive and run commands via HTTP POST
app.post('/', (req, res) => {
  reruns = {};
  module.exports.run(req.body.code);
  res.send({
    status: 200,
  });
});

app.post('/hooks/clear', (req, res) => {
  reruns = {};
  res.sendStatus(200);
});

app.post('/stop', (req, res) => {
  reruns = {};
  res.sendStatus(200);
});

app.post('/meta', (req, res) => {
  osc_package.send(new OSCPACKAGE.Message(`/bpm`, req.body.bpm));
  osc_package.send(new OSCPACKAGE.Message(`/steps`, req.body.steps));
  res.sendStatus(200);
});

app.get('/update', (req, res) => {
  for (const [fp_name, code] of Object.entries(reruns)) {
    module.exports.run(code);
  }
  res.sendStatus(200);
});

app.get('/cleanup', (req, res) => {
  module.exports.cleanUp();
  res.sendStatus(200);
});

// run the server
const server = app.listen(1123);

// reports CPU usage of the process every 500ms
setInterval(getCpuUsage, 500);

// initialize and open a window in the browser with the text editor
frontEndWebApp.use(express.static(path.join(__dirname, '../')));
const frontEndServer = frontEndWebApp.listen(1124);

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

function getCpuUsage () {
  os_utils.cpuUsage( (percent_cpu) => {
    osc_package.send(new OSCPACKAGE.Message('/cpu', Math.round(percent_cpu*100)));
  });
}

function postToTransport (fp) {
  axios.post('http://localhost:3211/update',
    {
      pattern: JSON.stringify(fp)
    }
  )
  .catch(function (error) {
    console.log(`error posting to transport server: ${error}`);
  });
}

function postMetaDataToTransport (fp,data_type) {
  axios.post('http://localhost:3211/meta',
    {
      pattern: JSON.stringify(fp),
      type: data_type
    }
  )
  .catch(function (error) {
    console.log(`error posting metadata to transport server: ${error}`);
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
