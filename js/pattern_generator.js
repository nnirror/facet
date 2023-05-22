const { exec } = require('child_process');
const {Worker} = require('worker_threads');
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const axios = require('axios');
const app = express();
const frontEndWebApp = express();
const cors = require('cors');
const fs = require('fs');
const os_utils = require('os-utils');
const WaveFile = require('wavefile').WaveFile;
const FacetConfig = require('./config.js');
const FACET_SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
let bpm = 90;
let bars_elapsed = 0;
let reruns = {};
let errors = [];
let percent_cpu = 0;
let mousex, mousey;
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
    fs.writeFileSync('js/env.js', '');
    fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  },
  initEnv: () => {
    fs.writeFileSync('js/env.js', '');
  },
  run: (code, is_rerun) => {
    if ( (is_rerun === true && percent_cpu < 0.5 ) || is_rerun === false ) {
      const worker = new Worker("./js/run.js", {workerData:{code:code},resourceLimits:{stackSizeMb:16}});
      worker.once("message", run_data => {
          let fps = run_data.fps;
          Object.values(fps).forEach(fp => {
            // if failed execution BUT doesnt exist in reruns yet, you can add it. otherwise skip any failed executions
            if ( fp.do_not_regenerate === false && ( fp.executed_successfully == true || ( fp.executed_successfully == false && reruns.hasOwnProperty(fp.name) == false ) ) ) {
              // don't add to reruns if it's meant to not regenerate via .keep()
              if ( is_rerun === false ) {
                // and only add to reruns the first time the code is POSTed
                reruns[fp.name] = fp;
              }
            }
            if ( fp.bpm_pattern !== false ) {
              postMetaDataToTransport(fp.bpm_pattern,'bpm');
            }
            if ( typeof fp == 'object' && fp.skipped !== true && !isNaN(fp.data[0]) ) {
              fp.data = sliceEndFade(fp.data);
              // create wav file at FACET_SAMPLE_RATE, 32-bit floating point
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
          Object.values(run_data.errors).forEach(error => {
            errors.push(error.message);
          });
      });
    }
  }
}

app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));
app.use(bodyParser.json({limit: '1000mb'}));
app.use(cors());
module.exports.initEnv();

// make the tmp/ directory if it doesn't exist
if ( !fs.existsSync('tmp/')) {
    fs.mkdirSync('tmp/');
};

// receive and run commands via HTTP POST
app.post('/', (req, res) => {
  startTransport();
  module.exports.run(req.body.code,false);
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
  axios.post('http://localhost:3211/stop',{})
  .catch(function (error) {
    console.log(`error stopping transport server: ${error}`);
  });
  res.sendStatus(200);
});

app.post('/meta', (req, res) => {
  bpm = req.body.bpm;
  bars_elapsed = req.body.bars_elapsed;
    // rewrite env.js, the environment variables that can be accessed in all future evals.
    // it's loaded into each FacetPattern instance on consruction
    fs.writeFileSync('js/env.js',
      calculateNoteValues(bpm) +
      `var bpm=${bpm};var bars=${bars_elapsed};var mousex=${mousex};var mousey=${mousey};`,
      ()=> {}
    );
  res.sendStatus(200);
});

app.post('/status', (req, res) => {
  // set mousex and mousey variables from the mouse position in the browser editor
  mousex = req.body.mousex;
  mousey = req.body.mousey;
  res.send({
    data: {
      bpm: bpm,
      cpu: percent_cpu,
      errors: errors
    },
    status: 200
  });
  errors = [];
});

app.get('/update', (req, res) => {
  for (const [fp_name, fp] of Object.entries(reruns)) {
    // determine which patterns to rerun
    if ( fp.regenerate_every_n_loops == 1
      || ((fp.loops_since_generation > 0) && ((fp.loops_since_generation % fp.regenerate_every_n_loops) == 0 ))
    ) {
      module.exports.run(fp.original_command,true);
      fp.loops_since_generation = 1;
    }
    else {
      fp.loops_since_generation++;
    }
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

function calculateNoteValues(bpm) {
  let out = '';
  for (var i = 1; i <= 128; i++) {
    let calculated_nv = Math.round((((60000/bpm)/i)*4)*(FACET_SAMPLE_RATE*0.001));
    out += `var n${i} = ${calculated_nv};`
  }
  return out;
}

function getCpuUsage () {
  os_utils.cpuUsage( (cpu) => {
    percent_cpu = cpu;
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

function startTransport () {
  axios.post('http://localhost:3211/play',{})
  .catch(function (error) {
    console.log(`error starting transport server: ${error}`);
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

function sliceEndFade(array) {
  let result = [...array];
  let fadeLength = 128;
  for (let i = array.length - fadeLength; i < array.length; i++) {
    let t = (i - (array.length - fadeLength)) / fadeLength;
    result[i] = array[i] * (1 - t);
  }
  return result;
}