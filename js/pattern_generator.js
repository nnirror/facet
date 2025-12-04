const { exec } = require('child_process');
const { Worker } = require('worker_threads');
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const axios = require('axios');
const app = express();
const frontEndWebApp = express();
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const os_utils = require('os-utils');
const strip = require('strip-comments');
const WaveFile = require('wavefile').WaveFile;
const FacetPattern = require('./FacetPattern.js');
const parser = require('./parse.js')
const FacetConfig = require('./config.js');
const SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
const HOST = FacetConfig.settings.HOST;
const utils = fs.readFileSync('js/utils.js', 'utf8', (err, data) => { return data });
const fp_name_regex = /\$\((['"])(.+?)\1\)/;
let bpm = 90;
let bars_elapsed = 0;
let time_signature_numerator = 4;
let time_signature_denominator = 4;
let reruns = {};
let errors = [];
let workers = [];
let workerMap = new Map();
let percent_cpu = 0;
let globalStopFlag = false;
let mousex, mousey;
let cross_platform_copy_command = process.platform == 'win32' ? 'copy \/y' : 'cp';
let vars = [];
let env = { bpm: -1, bars_elapsed: -1, mousex: -1, mousey: -1 };
let env_string = '';
let cross_platform_slash = process.platform == 'win32' ? '\\' : '/';

// request queue management
const BASE_MAX_WORKERS = 4; // base limit for concurrent pattern generation
const requestQueue = [];
let activeWorkers = 0;

// dynamic worker limit based on CPU usage
function getMaxWorkers() {
  if (percent_cpu < 0.4) return BASE_MAX_WORKERS + 2;
  if (percent_cpu < 0.6) return BASE_MAX_WORKERS + 1;
  if (percent_cpu < 0.8) return BASE_MAX_WORKERS;
  return Math.max(2, BASE_MAX_WORKERS - 1);
}

process.title = 'facet_pattern_generator';

// Log uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
  process.exit(1);
});

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

axios.interceptors.request.use(request => {
  request.maxContentLength = Infinity;
  request.maxBodyLength = Infinity;
  return request;
})

module.exports = {
  cleanUp: () => {
    fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  },
  run: (code, is_rerun, mode) => {
    // add to queue if at capacity, otherwise execute immediately
    const maxWorkers = getMaxWorkers();
    if (activeWorkers >= maxWorkers) {
      requestQueue.push({ code, is_rerun, mode });
    } else {
      executePattern(code, is_rerun, mode);
    }
  }
}

app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));
app.use(bodyParser.json({ limit: '1000mb' }));
app.use(cors());

// make the tmp/ directory if it doesn't exist
if (!fs.existsSync('tmp/')) {
  fs.mkdirSync('tmp/');
};

app.post('/meta', (req, res) => {
  bpm = req.body.bpm;
  bars_elapsed = req.body.bars_elapsed;
  time_signature_numerator = req.body.time_signature_numerator;
  time_signature_denominator = req.body.time_signature_denominator;
  if (bpm != env.bpm || bars_elapsed != env.bars_elapsed || mousex != env.mousex || mousey != env.mousey) {
    env_string = calculateNoteValues(bpm, time_signature_numerator, time_signature_denominator) + `var bpm=${bpm};var bars=${bars_elapsed};var mousex=${mousex};var mousey=${mousey};var time_num=${time_signature_numerator};var time_denom=${time_signature_denominator};`;
  }
  res.sendStatus(200);
  env.bpm = bpm;
  env.bars_elapsed = bars_elapsed;
  env.mousex = mousex;
  env.mousey = mousey;
});

app.get('/update', (req, res) => {
  // don't process any updates if global stop flag is set
  if (globalStopFlag) {
    res.sendStatus(200);
    return;
  }
  
  for (const [fp_name, fp] of Object.entries(reruns)) {
    // determine which patterns to rerun 
    if (fp.whenmod_modulo_operand == false
      || ((fp.loops_since_generation > 0) && ((bars_elapsed % fp.whenmod_modulo_operand) == fp.whenmod_equals))
    ) {
      module.exports.run(fp.original_command, true, 'run');
      fp.available_for_next_request = false;
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

// run the server with WebSocket support
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ws event handlers
io.on('connection', (socket) => {

  // handle code execution
  socket.on('runCode', (data) => {
    globalStopFlag = false;
    startTransport();
    module.exports.run(data.code, false, data.mode);
  });

  // handle hooks clear
  socket.on('clearHooks', () => {
    reruns = {};
    globalStopFlag = true;
    terminateAllWorkers();
    setTimeout(() => {
      globalStopFlag = false;
    }, 100);
  });

  // handle stop command
  socket.on('stop', () => {
    reruns = {};
    globalStopFlag = true;
    terminateAllWorkers();
    axios.post(`http://${HOST}:3211/stop`, {})
      .catch(function (error) {});
  });

  // handle autocomplete request
  socket.on('autocomplete', () => {
    let blacklist = ["__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "bpfInner", "biquad", "chaosInner", "constructor", "convertSamplesToSeconds", "fadeArrays", "fixnan", "getEnv", "getMaximumValue", "getUtils", "hannWindow", "hasOwnProperty", "hpfInner", "isFacetPattern", "isPrototypeOf", "loadBuffer", "logslider", "lpfInner", "makePatternsTheSameSize", "prevPowerOf2", "propertyIsEnumerable", "resample", "resizeInner", "sliceEndFade", "stringLeftRotate", "stringRightRotate", "toLocaleString", "toString", "valueOf", "butterworthFilter", "fftPhase", "fftMag", "scaleLT1", "nextPowerOf2", "getSavedPattern","calculateRepeatScore"]
    let all_methods = getAllFuncs(new FacetPattern());
    let available_methods = []
    for (var i = 0; i < all_methods.length; i++) {
      let method = all_methods[i];
      if (!blacklist.includes(method.name)) {
        available_methods.push(method.example);
      }
    }
    socket.emit('autocompleteResponse', {
      methods: available_methods
    });
  });

  // handle status request
  socket.on('status', (data) => {
    // set mousex and mousey variables from the mouse position in the browser editor
    mousex = data.mousex;
    mousey = data.mousey;
    socket.emit('statusResponse', {
      bpm: bpm,
      cpu: percent_cpu,
      errors: errors,
      queueLength: requestQueue.length,
      activeWorkers: activeWorkers,
      maxWorkers: getMaxWorkers()
    });
    errors = [];
  });
});

server.listen(1123);

// reports CPU usage of the process every 500ms
setInterval(getCpuUsage, 50);

// process queue periodically to ensure no requests get stuck
setInterval(processQueue, 100);

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

function terminateAllWorkers() {
  workers.forEach(worker => {
    worker.terminate();  // cancel the worker thread
  });
  workers = [];  // all workers have been terminated
  workerMap.clear();
  activeWorkers = 0;
  requestQueue.length = 0; // clear the queue
}

function processQueue() {
  // don't process queue if global stop flag is set
  if (globalStopFlag) {
    return;
  }
  
  const maxWorkers = getMaxWorkers();
  if (requestQueue.length > 0 && activeWorkers < maxWorkers) {
    const nextRequest = requestQueue.shift();
    executePattern(nextRequest.code, nextRequest.is_rerun, nextRequest.mode);
  }
}

function executePattern(code, is_rerun, mode) {
  // don't execute if global stop flag is set
  if (globalStopFlag) {
    return;
  }
  
  if ((is_rerun === true && percent_cpu < 0.7) || is_rerun === false) {
    activeWorkers++;
    
    user_input = strip(code);
    user_input = parser.delimitEndsOfCommands(user_input);
    let commands = parser.splitCommandsOnDelimiter(user_input);
    Object.values(commands).forEach(command => {
      let code = parser.replaceDelimiterWithSemicolon(command);
      code = parser.formatCode(code);
      const match = code.match(fp_name_regex);
      if (!match || !match[2]) {
        // skip commands that don't have a valid pattern name format
        activeWorkers--;
        return;
      }
      fp_name = match[2];
      if (is_rerun === false) {
        // when manually run, find and stop any existing worker with the supplied fp name
        for (const [worker, name] of workerMap.entries()) {
          if (name === fp_name) {
            worker.terminate();
            workerMap.delete(worker);
            delete reruns[fp_name];
          }
        }
      }
      let worker = new Worker("./js/run.js", { workerData: { code: code, mode: mode, vars: vars, env: env_string, utils: utils, is_rerun: is_rerun, fp_name: fp_name }, resourceLimits: { stackSizeMb: 128 } });
      workerMap.set(worker, fp_name);
      workers.push(worker);
      worker.once("message", run_data => {
        // if global stop flag is set, ignore all worker results
        if (globalStopFlag) {
          activeWorkers--;
          return;
        }
        
        // decrement active workers when this worker finishes
        activeWorkers--;
        
        let fps = run_data.fps;
        Object.values(fps).forEach(fp => {
          // ...existing worker message handling code...
          let index = workers.findIndex(workerObj => workerObj === worker);
          if (index !== -1) {
            workers.splice(index, 1);
            // images need to continue after the pattern is processed so the worker cannot be terminated
            if (!fp.is_image) {
              worker.terminate();
            }
          }
          // set vars here - loop through
          for (let fp_var_key in fp.vars) {
            if (fp.vars.hasOwnProperty(fp_var_key)) {
              vars[fp_var_key] = fp.vars[fp_var_key];
            }
          }
          if (fp.is_stopped == true || mode == 'stop') {
            delete reruns[fp.name];
            // if the command is to stop playback, find the worker and stop it
            for (const [worker, name] of workerMap.entries()) {
              if (name === fp.name) {
                worker.terminate();
                workerMap.delete(worker);
              }
            }
            if (fp.bpm_pattern !== false && !globalStopFlag) {
              postMetaDataToTransport(fp.bpm_pattern, 'bpm');
            }
            else if (!globalStopFlag) {
              postToTransport(fp);
            }
          }
          if (fp.do_not_regenerate === true) {
            delete reruns[fp.name];
          }

          if (fp.executed_successfully === true && fp.do_not_regenerate === false && is_rerun === false && fp.is_stopped !== true && !globalStopFlag) {
            // and only add to reruns the first time the code is POSTed and runs successfully
            reruns[fp.name] = fp;
          }
          if (reruns[fp.name] && fp.is_stopped !== true && !globalStopFlag) {
            reruns[fp.name].available_for_next_request = true;
          }
          fp.name = fp.name + `---${Date.now()}`;
          if (fp.bpm_pattern !== false && !globalStopFlag) {
            postMetaDataToTransport(fp.bpm_pattern, 'bpm');
          }
          if (fp.time_signature_denominator && !globalStopFlag) {
            postMetaDataToTransport(fp, 'time_signature_denominator');
          }
          if (fp.time_signature_numerator && !globalStopFlag) {
            postMetaDataToTransport(fp, 'time_signature_numerator');
          }
          if (typeof fp == 'object' && fp.skipped !== true && !globalStopFlag) {
            if (fp.sequence_data.length > 0) {
              // create wav file at SAMPLE_RATE, 32-bit floating point
              let a_wav = new WaveFile();
              a_wav.fromScratch(1, SAMPLE_RATE, '32f', fp.data);
              // store wav file in /tmp/
              fs.writeFile(`tmp/${fp.name}.wav`, a_wav.toBuffer(), (err) => {
                if (!globalStopFlag) {  // double-check before posting
                  postToTransport(fp);
                  checkToSave(fp);
                }
              });
            }
            else {
              postToTransport(fp);
              checkToSave(fp);
            }
          }
        });
        Object.values(run_data.errors).forEach(error => {
          if (error.message) {
            errors.push(error.message);
          }
          else {
            errors.push(error);
          }
        });

        // process next item in queue
        processQueue();
      });
    });
  }
}

function calculateNoteValues(bpm, time_signature_numerator, time_signature_denominator) {
  let out = '';
  for (var i = 1; i <= 128; i++) {
    let calculated_nv = Math.round((((60000 / bpm) / i) * (time_signature_numerator / (time_signature_denominator / 4))) * (SAMPLE_RATE * 0.001));
    out += `var n${i} = ${calculated_nv};`
  }
  return out;
}

function getCpuUsage() {
  os_utils.cpuUsage((cpu) => {
    percent_cpu = cpu;
  });
}

function postToTransport(fp) {
  // remove this.data as it's not needed in the transport and is potentially huge
  let fpCopy = { ...fp };
  delete fpCopy.data;
  axios.post(`http://${HOST}:3211/update`,
    {
      pattern: JSON.stringify(fpCopy)
    }
  )
    .catch(function (error) {
      console.log(`error posting to transport server: ${error}`);
    });
}

function startTransport() {
  axios.post(`http://${HOST}:3211/play`, {})
    .catch(function (error) {
      console.log(`error starting transport server: ${error}`);
    });
}

function postMetaDataToTransport(fp, data_type) {
  axios.post(`http://${HOST}:3211/meta`,
    {
      pattern: JSON.stringify(fp),
      type: data_type
    }
  )
    .catch(function (error) {
      console.log(`error posting metadata to transport server: ${error}`);
    });
}

function checkToSave(fp) {
  if (fp.saveas_filename !== false) {
    if (typeof fp.saveas_filename !== 'string') {
      fp.saveas_filename = fp.saveas_filename.toString();
    }
    let filenameParts = fp.saveas_filename.split(cross_platform_slash);
    let filename = filenameParts.pop();
    let folder = 'samples';

    filenameParts.forEach(part => {
      folder += `${cross_platform_slash}${part}`;
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
    });
    exec(`${cross_platform_copy_command} tmp${cross_platform_slash}${fp.name}.wav ${folder}${cross_platform_slash}${filename}.wav`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
    });
  }
}

// list all properties of a class that are functions, from: https://stackoverflow.com/a/31055217
function getAllFuncs(toCheck) {
  const props = [];
  let obj = toCheck;
  do {
    props.push(...Object.getOwnPropertyNames(obj));
  } while (obj = Object.getPrototypeOf(obj));

  return props.sort().filter((e, i, arr) => {
    if (e != arr[i + 1] && typeof toCheck[e] == 'function') return true;
  }).map(funcName => {
    const funcStr = toCheck[funcName].toString();
    const argsMatch = funcStr.match(/\(([^()]*|\(([^()]*|\([^()]*\))*\))*\)/);
    const argsStr = argsMatch ? argsMatch[0].slice(1, -1) : '';
    const args = argsStr.split(',').map(arg => arg.trim()).join(', ');
    return { name: funcName, example: `${funcName}(${args})` };
  });
}

