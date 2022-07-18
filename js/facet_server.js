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
            a_wav.fromScratch(1, 44100, '32f', fp.data);
            // store wav file in /tmp/
            fs.writeFile(`tmp/${fp.name}.wav`, a_wav.toBuffer(),(err) => {
              // add to list of available samples for sequencing
              facet_patterns[fp.name] = fp;
              addAnyHooks(fp, hook_mode, fp.original_command);
              fs.writeFile('js/patterns.json', JSON.stringify(facet_patterns),()=> {
                fs.writeFile('js/hooks.json', JSON.stringify(hooks),()=> {
                  // tell the :3211 transport server to reload hooks and patterns
                  axios.get('http://localhost:3211/update')
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
  fs.writeFile('js/hooks.json', '{}',()=>{axios.get('http://localhost:3211/update')});
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
  hooks = {};
  res.sendStatus(200);
});

app.post('/status', (req, res) => {
  // stores any environment variables that might be needed in any future eval statements in a file that is loaded into the FacetPattern
  // instance when it's constructed
  fs.writeFileSync('js/env.js', `
    var bpm=${req.body.bpm};
    var mousex=${req.body.mousex};
    var mousey=${req.body.mousey};
    var n1 = ${Math.round((((60000 / req.body.bpm) / 1) * 4) * 44.1)};
    var n2 = ${Math.round((((60000 / req.body.bpm) / 2) * 4) * 44.1)};
    var n3 = ${Math.round((((60000 / req.body.bpm) / 3) * 4) * 44.1)};
    var n4 = ${Math.round((((60000 / req.body.bpm) / 4) * 4) * 44.1)};
    var n5 = ${Math.round((((60000 / req.body.bpm) / 5) * 4) * 44.1)};
    var n6 = ${Math.round((((60000 / req.body.bpm) / 6) * 4) * 44.1)};
    var n7 = ${Math.round((((60000 / req.body.bpm) / 7) * 4) * 44.1)};
    var n8 = ${Math.round((((60000 / req.body.bpm) / 8) * 4) * 44.1)};
    var n9 = ${Math.round((((60000 / req.body.bpm) / 9) * 4) * 44.1)};
    var n10 = ${Math.round((((60000 / req.body.bpm)/10) * 4) * 44.1)};
    var n11 = ${Math.round((((60000 / req.body.bpm)/11) * 4) * 44.1)};
    var n12 = ${Math.round((((60000 / req.body.bpm)/12) * 4) * 44.1)};
    var n13 = ${Math.round((((60000 / req.body.bpm)/13) * 4) * 44.1)};
    var n14 = ${Math.round((((60000 / req.body.bpm)/14) * 4) * 44.1)};
    var n15 = ${Math.round((((60000 / req.body.bpm)/15) * 4) * 44.1)};
    var n16 = ${Math.round((((60000 / req.body.bpm)/16) * 4) * 44.1)};
    var n17 = ${Math.round((((60000 / req.body.bpm)/17) * 4) * 44.1)};
    var n18 = ${Math.round((((60000 / req.body.bpm)/18) * 4) * 44.1)};
    var n19 = ${Math.round((((60000 / req.body.bpm)/19) * 4) * 44.1)};
    var n20 = ${Math.round((((60000 / req.body.bpm)/10) * 4) * 44.1)};
    var n21 = ${Math.round((((60000 / req.body.bpm)/21) * 4) * 44.1)};
    var n22 = ${Math.round((((60000 / req.body.bpm)/22) * 4) * 44.1)};
    var n23 = ${Math.round((((60000 / req.body.bpm)/23) * 4) * 44.1)};
    var n24 = ${Math.round((((60000 / req.body.bpm)/24) * 4) * 44.1)};
    var n25 = ${Math.round((((60000 / req.body.bpm)/25) * 4) * 44.1)};
    var n26 = ${Math.round((((60000 / req.body.bpm)/26) * 4) * 44.1)};
    var n27 = ${Math.round((((60000 / req.body.bpm)/27) * 4) * 44.1)};
    var n28 = ${Math.round((((60000 / req.body.bpm)/28) * 4) * 44.1)};
    var n29 = ${Math.round((((60000 / req.body.bpm)/29) * 4) * 44.1)};
    var n30 = ${Math.round((((60000 / req.body.bpm)/30) * 4) * 44.1)};
    var n31 = ${Math.round((((60000 / req.body.bpm)/31) * 4) * 44.1)};
    var n32 = ${Math.round((((60000 / req.body.bpm)/32) * 4) * 44.1)};
    var n33 = ${Math.round((((60000 / req.body.bpm)/33) * 4) * 44.1)};
    var n34 = ${Math.round((((60000 / req.body.bpm)/34) * 4) * 44.1)};
    var n35 = ${Math.round((((60000 / req.body.bpm)/35) * 4) * 44.1)};
    var n36 = ${Math.round((((60000 / req.body.bpm)/36) * 4) * 44.1)};
    var n37 = ${Math.round((((60000 / req.body.bpm)/37) * 4) * 44.1)};
    var n38 = ${Math.round((((60000 / req.body.bpm)/38) * 4) * 44.1)};
    var n39 = ${Math.round((((60000 / req.body.bpm)/39) * 4) * 44.1)};
    var n40 = ${Math.round((((60000 / req.body.bpm)/40) * 4) * 44.1)};
    var n41 = ${Math.round((((60000 / req.body.bpm)/41) * 4) * 44.1)};
    var n42 = ${Math.round((((60000 / req.body.bpm)/42) * 4) * 44.1)};
    var n43 = ${Math.round((((60000 / req.body.bpm)/43) * 4) * 44.1)};
    var n44 = ${Math.round((((60000 / req.body.bpm)/44) * 4) * 44.1)};
    var n45 = ${Math.round((((60000 / req.body.bpm)/45) * 4) * 44.1)};
    var n46 = ${Math.round((((60000 / req.body.bpm)/46) * 4) * 44.1)};
    var n47 = ${Math.round((((60000 / req.body.bpm)/47) * 4) * 44.1)};
    var n48 = ${Math.round((((60000 / req.body.bpm)/48) * 4) * 44.1)};
    var n49 = ${Math.round((((60000 / req.body.bpm)/49) * 4) * 44.1)};
    var n40 = ${Math.round((((60000 / req.body.bpm)/40) * 4) * 44.1)};
    var n41 = ${Math.round((((60000 / req.body.bpm)/41) * 4) * 44.1)};
    var n42 = ${Math.round((((60000 / req.body.bpm)/42) * 4) * 44.1)};
    var n43 = ${Math.round((((60000 / req.body.bpm)/43) * 4) * 44.1)};
    var n44 = ${Math.round((((60000 / req.body.bpm)/44) * 4) * 44.1)};
    var n45 = ${Math.round((((60000 / req.body.bpm)/45) * 4) * 44.1)};
    var n46 = ${Math.round((((60000 / req.body.bpm)/46) * 4) * 44.1)};
    var n47 = ${Math.round((((60000 / req.body.bpm)/47) * 4) * 44.1)};
    var n48 = ${Math.round((((60000 / req.body.bpm)/48) * 4) * 44.1)};
    var n49 = ${Math.round((((60000 / req.body.bpm)/49) * 4) * 44.1)};
    var n50 = ${Math.round((((60000 / req.body.bpm)/50) * 4) * 44.1)};
    var n51 = ${Math.round((((60000 / req.body.bpm)/51) * 4) * 44.1)};
    var n52 = ${Math.round((((60000 / req.body.bpm)/52) * 4) * 44.1)};
    var n53 = ${Math.round((((60000 / req.body.bpm)/53) * 4) * 44.1)};
    var n54 = ${Math.round((((60000 / req.body.bpm)/54) * 4) * 44.1)};
    var n55 = ${Math.round((((60000 / req.body.bpm)/55) * 4) * 44.1)};
    var n56 = ${Math.round((((60000 / req.body.bpm)/56) * 4) * 44.1)};
    var n57 = ${Math.round((((60000 / req.body.bpm)/57) * 4) * 44.1)};
    var n58 = ${Math.round((((60000 / req.body.bpm)/58) * 4) * 44.1)};
    var n59 = ${Math.round((((60000 / req.body.bpm)/59) * 4) * 44.1)};
    var n60 = ${Math.round((((60000 / req.body.bpm)/60) * 4) * 44.1)};
    var n61 = ${Math.round((((60000 / req.body.bpm)/61) * 4) * 44.1)};
    var n62 = ${Math.round((((60000 / req.body.bpm)/62) * 4) * 44.1)};
    var n63 = ${Math.round((((60000 / req.body.bpm)/63) * 4) * 44.1)};
    var n64 = ${Math.round((((60000 / req.body.bpm)/64) * 4) * 44.1)};
    var n65 = ${Math.round((((60000 / req.body.bpm)/65) * 4) * 44.1)};
    var n66 = ${Math.round((((60000 / req.body.bpm)/66) * 4) * 44.1)};
    var n67 = ${Math.round((((60000 / req.body.bpm)/67) * 4) * 44.1)};
    var n68 = ${Math.round((((60000 / req.body.bpm)/68) * 4) * 44.1)};
    var n69 = ${Math.round((((60000 / req.body.bpm)/69) * 4) * 44.1)};
    var n70 = ${Math.round((((60000 / req.body.bpm)/60) * 4) * 44.1)};
    var n71 = ${Math.round((((60000 / req.body.bpm)/71) * 4) * 44.1)};
    var n72 = ${Math.round((((60000 / req.body.bpm)/72) * 4) * 44.1)};
    var n73 = ${Math.round((((60000 / req.body.bpm)/73) * 4) * 44.1)};
    var n74 = ${Math.round((((60000 / req.body.bpm)/74) * 4) * 44.1)};
    var n75 = ${Math.round((((60000 / req.body.bpm)/75) * 4) * 44.1)};
    var n76 = ${Math.round((((60000 / req.body.bpm)/76) * 4) * 44.1)};
    var n77 = ${Math.round((((60000 / req.body.bpm)/77) * 4) * 44.1)};
    var n78 = ${Math.round((((60000 / req.body.bpm)/78) * 4) * 44.1)};
    var n79 = ${Math.round((((60000 / req.body.bpm)/79) * 4) * 44.1)};
    var n80 = ${Math.round((((60000 / req.body.bpm)/80) * 4) * 44.1)};
    var n81 = ${Math.round((((60000 / req.body.bpm)/81) * 4) * 44.1)};
    var n82 = ${Math.round((((60000 / req.body.bpm)/82) * 4) * 44.1)};
    var n83 = ${Math.round((((60000 / req.body.bpm)/83) * 4) * 44.1)};
    var n84 = ${Math.round((((60000 / req.body.bpm)/84) * 4) * 44.1)};
    var n85 = ${Math.round((((60000 / req.body.bpm)/85) * 4) * 44.1)};
    var n86 = ${Math.round((((60000 / req.body.bpm)/86) * 4) * 44.1)};
    var n87 = ${Math.round((((60000 / req.body.bpm)/87) * 4) * 44.1)};
    var n88 = ${Math.round((((60000 / req.body.bpm)/88) * 4) * 44.1)};
    var n89 = ${Math.round((((60000 / req.body.bpm)/89) * 4) * 44.1)};
    var n90 = ${Math.round((((60000 / req.body.bpm)/90) * 4) * 44.1)};
    var n91 = ${Math.round((((60000 / req.body.bpm)/91) * 4) * 44.1)};
    var n92 = ${Math.round((((60000 / req.body.bpm)/92) * 4) * 44.1)};
    var n93 = ${Math.round((((60000 / req.body.bpm)/93) * 4) * 44.1)};
    var n94 = ${Math.round((((60000 / req.body.bpm)/94) * 4) * 44.1)};
    var n95 = ${Math.round((((60000 / req.body.bpm)/95) * 4) * 44.1)};
    var n96 = ${Math.round((((60000 / req.body.bpm)/96) * 4) * 44.1)};
    var n97 = ${Math.round((((60000 / req.body.bpm)/97) * 4) * 44.1)};
    var n98 = ${Math.round((((60000 / req.body.bpm)/98) * 4) * 44.1)};
    var n99 = ${Math.round((((60000 / req.body.bpm)/99) * 4) * 44.1)};
    var n100 = ${Math.round((((60000 / req.body.bpm)/100) * 4) * 44.1)};
    var n101 = ${Math.round((((60000 / req.body.bpm)/101) * 4) * 44.1)};
    var n102 = ${Math.round((((60000 / req.body.bpm)/102) * 4) * 44.1)};
    var n103 = ${Math.round((((60000 / req.body.bpm)/103) * 4) * 44.1)};
    var n104 = ${Math.round((((60000 / req.body.bpm)/104) * 4) * 44.1)};
    var n105 = ${Math.round((((60000 / req.body.bpm)/105) * 4) * 44.1)};
    var n106 = ${Math.round((((60000 / req.body.bpm)/106) * 4) * 44.1)};
    var n107 = ${Math.round((((60000 / req.body.bpm)/107) * 4) * 44.1)};
    var n108 = ${Math.round((((60000 / req.body.bpm)/108) * 4) * 44.1)};
    var n109 = ${Math.round((((60000 / req.body.bpm)/109) * 4) * 44.1)};
    var n110 = ${Math.round((((60000 / req.body.bpm)/110) * 4) * 44.1)};
    var n111 = ${Math.round((((60000 / req.body.bpm)/111) * 4) * 44.1)};
    var n112 = ${Math.round((((60000 / req.body.bpm)/112) * 4) * 44.1)};
    var n113 = ${Math.round((((60000 / req.body.bpm)/113) * 4) * 44.1)};
    var n114 = ${Math.round((((60000 / req.body.bpm)/114) * 4) * 44.1)};
    var n115 = ${Math.round((((60000 / req.body.bpm)/115) * 4) * 44.1)};
    var n116 = ${Math.round((((60000 / req.body.bpm)/116) * 4) * 44.1)};
    var n117 = ${Math.round((((60000 / req.body.bpm)/117) * 4) * 44.1)};
    var n118 = ${Math.round((((60000 / req.body.bpm)/118) * 4) * 44.1)};
    var n119 = ${Math.round((((60000 / req.body.bpm)/119) * 4) * 44.1)};
    var n120 = ${Math.round((((60000 / req.body.bpm)/120) * 4) * 44.1)};
    var n121 = ${Math.round((((60000 / req.body.bpm)/121) * 4) * 44.1)};
    var n122 = ${Math.round((((60000 / req.body.bpm)/122) * 4) * 44.1)};
    var n123 = ${Math.round((((60000 / req.body.bpm)/123) * 4) * 44.1)};
    var n124 = ${Math.round((((60000 / req.body.bpm)/124) * 4) * 44.1)};
    var n125 = ${Math.round((((60000 / req.body.bpm)/125) * 4) * 44.1)};
    var n126 = ${Math.round((((60000 / req.body.bpm)/126) * 4) * 44.1)};
    var n127 = ${Math.round((((60000 / req.body.bpm)/127) * 4) * 44.1)};
    var n128 = ${Math.round((((60000 / req.body.bpm)/128) * 4) * 44.1)};
  `,()=> {});
  res.sendStatus(200);
});

app.get('/update', (req, res) => {
  facet_patterns = getPatterns();
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
  fs.writeFileSync('js/reruns.json', '{}');
  fs.writeFileSync('js/patterns.json', '{}');
  fs.writeFileSync('js/hooks.json', '{}');
  fs.writeFileSync('js/env.js', '');
  fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  process.exit()
});

// catches ctrl+c event
process.on('SIGINT', () => {
  fs.writeFileSync('js/stored.json', '{}');
  fs.writeFileSync('js/reruns.json', '{}');
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
