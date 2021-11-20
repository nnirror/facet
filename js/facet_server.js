const path = require('path');
const Max = require('max-api');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
var cors = require('cors');
const OSC = require('osc-js');
const fs = require('fs');
const WaveFile = require('wavefile').WaveFile;
const facet = require('./facet.js');
const float_to_bin = require('./float_to_bin.js');

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
  let commands = [], destination, property, statement, datum, ops_string,
  operations = [], max_sub_steps, flat_sequence, sequence_msg, mults = {}, current_command;
  // parse user input into individual operations on data.
  // run those operations, scale and flatten the resulting array,
  // and send that data into Max so it can go in a buffer wavetable
  try {
    user_input = facet.stripComments(req.body.code);
    commands = facet.getCommands(req.body.code);
    if (commands[0] == 'mute()') {
      Max.outlet(`global mute`);
    }
    else {
      Object.values(commands).forEach(command => {
        current_command = facet.removeTabsAndNewlines(command);
        command = facet.removeTabsAndNewlines(command);
        destination = facet.getDestination(command);
        property = facet.getProperty(command, destination);
        statement = facet.getStatement(command, property);
        statement = facet.handleReruns(statement);
        // this is where i would need to refactor the actual "parser", in the stack of functions that getDatum
        // and processCode currently run. Instead i shold take a step back and map out all the things before starting
        // so i can make it intelligible
        datum = facet.getDatum(statement);
        datum = facet.processCode(statement, datum);
        if ( datum == 'SKIP' ) {
          // do nothing - don't add the command to the facets object
        }
        else {
          max_sub_steps = facet.getMaximumSubSteps(datum) - 1;
          flat_sequence = facet.flattenSequence(datum, max_sub_steps);
          facet.initFacetDestination(facet.facets, destination);
          facet.facets[destination][property] = facet.convertFlatSequenceToMessage(flat_sequence);
          facet.facets = facet.handleMultConnections(facet.facets, mults);
        }
      });
    }
  } catch (e) {
    throw(`${e}, command: ${current_command}`);
  }

  for (const [key, value] of Object.entries(facet.facets)) {
    for (const [k, facet_data] of Object.entries(value)) {
      let wav = new WaveFile();
      let data;
      // first check if a speed file exists - if not, create it
      if (fs.existsSync(`../tmp/${key}_speed.wav`)) {
        // do nothing
      } else {
        // create the speed file create it as buffer with 1 value in it: 1.
        data = [Math.fround(parseFloat(1))];
        wav.fromScratch(1, 44100, '32f', data);
        fs.writeFile(`../tmp/${key}_speed.wav`, wav.toBuffer(),(err) => {
          if (err) throw err;
          Max.outlet(`speed ${key}`);
        });
      }
      // now create a mono wave file, 44.1 kHz, 32-bit floating point, with the entire request body of numbers
      data = facet_data.split(' ');
      for (var i = 0; i < data.length; i++) {
        // convert every number in the wav buffer to 32-bit floating point. these numbers are allowed to be outside the [1.0 - -1.0] boundary
        data[i] = Math.fround(parseFloat(data[i]));
      }
      wav.fromScratch(1, 44100, '32f', data);
      // store the wav in /tmp/ for access in Max
      fs.writeFile(`../tmp/${key}_${k}.wav`, wav.toBuffer(),(err) => {
        if (err) throw err;
        // file written successfully - send an update/speed command out so the facet_param object can read the new data for this dest/prop
        if ( k === 'speed' ) {
          Max.outlet(`speed ${key}`);
        }
        else {
          Max.outlet(`update ${key}_${k}`);
        }
      });
    }
  }
  res.sendStatus(200);
});

app.listen(1123);
