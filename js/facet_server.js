const path = require('path');
const Max = require('max-api');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
var cors = require('cors');
const OSC = require('osc-js');
const fs = require('fs');
const WaveFile = require('wavefile').WaveFile;

const osc = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
osc.open();

const handlers = {
  bang: () => {
    let message = new OSC.Message('/eoc', 'bang');
      osc.send(message);
  },
  hook: (...args) => {
    let message = new OSC.Message('/hook', args[0]);
    osc.send(message);
  },
  set: (...args) => {
    let message = new OSC.Message('/set', args[0], args[1]);
    osc.send(message);
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
  }
};

Max.addHandlers(handlers);

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

app.post('/', function (req, res) {
// loop through each command in req.body. create a new buffer object in max if it doesnt exist, with an undercore between the vars
  for (let key in req.body) {
    for (let k in req.body[key]) {
      if ( key === 'global' && k === 'mute' ) {
        Max.outlet(`global mute`);
        continue;
      }
      let wav = new WaveFile();
      let data;
      // first check if a speed file exists - if not, create it
      if (fs.existsSync(`../tmp/${key}_speed.wav`)) {
        // do nothing
      } else {
        // create the speed file create it as buffer with 1 value in it: 1.
        data = [Math.fround(parseFloat(1))];
        wav.fromScratch(1, 44100, '32f', data);
        fs.writeFile(`../tmp/${key}_speed.wav`, wav.toBuffer(), err => {
          if (err) {
            console.error(err)
            return
          }
          Max.outlet(`speed ${key}`);
        });
      }
      // now create a mono wave file, 44.1 kHz, 32-bit floating point, with the entire request body of numbers
      data = req.body[key][k].split(' ');
      for (var i = 0; i < data.length; i++) {
        // convert every number in the wav buffer to 32-bit floating point. these numbers are allowed to be outside the [1.0 - -1.0] boundary
        data[i] = Math.fround(parseFloat(data[i]));
      }
      wav.fromScratch(1, 44100, '32f', data);
      // store the wav in /tmp/ for access in Max
      fs.writeFileSync(`../tmp/${key}_${k}.wav`, wav.toBuffer());
      // file written successfully - send an update/speed command out so the facet_param object can read the new data for this dest/prop
      if ( k === 'speed' ) {
        Max.outlet(`speed ${key}`);
      }
      else {
        Max.outlet(`update ${key}_${k}`);
      }
    }
  }
  res.sendStatus(200);
});

app.listen(1123);
