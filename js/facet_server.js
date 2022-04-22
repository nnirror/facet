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
let $ = FacetPattern;
const osc = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
osc.open();
let utils = fs.readFileSync('utils.js', 'utf8', (err, data) => {return data});

module.exports = {
  removeTabsAndNewlines: function (user_input) {
    user_input = user_input.replace(/\s\s+/g, '');
    user_input = user_input.replace(/\'/g, '"');
    user_input = user_input.replace(/;/g, ';\n');
    return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
  },
  initFacetDestination: function(facets, destination) {
    if ( !facets[destination] ) {
      facets[destination] = {};
    }
    return facets;
  },

  facetInit: function() {
    return {};
  },

  facets: {},

  convertFlatSequenceToMessage: function (flat_sequence) {
    let out = '';
    for (var i = 1; i <= flat_sequence.length; i++) {
      if ( isNaN(flat_sequence[i-1]) || !isFinite(flat_sequence[i-1]) ) {
        out += '0';
      }
      else {
        out += parseFloat(flat_sequence[i-1]).toFixed(4);
      }
      if ( i != flat_sequence.length ) {
         out += ' ';
      }
    }
    return out;
  },

  flattenSequence: function (sequence, max_sub_steps) {
    // converts a basic "sequence array" into an isomorphism that can go in a wavetable buffer.
    // if the "sequence array" was [0, 1, [2,4], [1,2,3,4]], the wavetable buffer would be:
    // [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 4, 4, 1, 2, 3, 4]
    let out = [];
    Object.values(sequence).forEach(step => {
      if ( Array.isArray(step) ) {
        let s = module.exports.flattenSequence(step, max_sub_steps-1);
        for (var i = 0; i < s.length; i++) {
          out.push(s[i]);
        }
      }
      else {
        for (var i = 0; i < Math.pow(2, max_sub_steps); i++) {
          out.push(step);
        }
      }
    });
    return out;
  },

  getCommands: function(user_input) {
     return user_input.trim().split(';').filter(Boolean);
  },

  // returns the maximum number of sub-steps in a given pattern.
  // needed to calculate the resolution of a given row sequence when converting from
  // multi-dimensional array to wavetable buffer
  getMaximumSubSteps: function (sequence) {
    return Array.isArray(sequence) ?
      1 + Math.max(...sequence.map(module.exports.getMaximumSubSteps)) :
      0;
  }
}

const handlers = {
  bang: () => {
    // runs on every bang of the facet_server metro, which itself can be configured via "metro speed"
    let message = new OSC.Message('/eoc', 'bang');
    osc.send(message);
  },
  hook: (...args) => {
    let message = new OSC.Message('/hook', args[0]);
    osc.send(message);
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
  }
};

Max.addHandlers(handlers);

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

module.exports.facetInit();

// make the ../tmp/ directory if it doesn't exist
if ( !fs.existsSync('../tmp/')) {
    fs.mkdirSync('../tmp/');
};

app.post('/', function (req, res) {
// loop through each command in req.body. create a new buffer object in max if it doesnt exist, with an undercore between the vars
  let commands = [], destination, property, statement, datum, ops_string,
  operations = [], max_sub_steps, flat_sequence, sequence_msg, current_command;
  // parse user input into individual operations on data.
  // run those operations, scale and flatten the resulting array,
  // and send that data into Max so it can go in a buffer wavetable
  try {
    user_input = commentStripper.stripComments(req.body.code);
    commands = module.exports.getCommands(req.body.code);
    if (commands[0] == 'mute()') {
      Max.outlet(`global mute`);
    }
    else {
      Object.values(commands).forEach(command => {
        command = module.exports.removeTabsAndNewlines(command);
        let fp = eval(utils + command);
        datum = fp.data;
        if ( datum == 'SKIP' ) {
          // TODO check this
          // do nothing - don't add the command to the facets object
        }
        else {
          max_sub_steps = module.exports.getMaximumSubSteps(datum) - 1;
          flat_sequence = module.exports.flattenSequence(datum, max_sub_steps);
          module.exports.initFacetDestination(module.exports.facets, fp.name);
          module.exports.facets[fp.name]['data'] = module.exports.convertFlatSequenceToMessage(flat_sequence);

          for (const [key, value] of Object.entries(module.exports.facets)) {
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
                  Max.outlet(`update ${key}_data`);
                }
              });
            }
          }
        }
      });
    }
    module.exports.facets = {};
  } catch (e) {
    res.send({
      error: `${e}, command: ${current_command}`
    });
  }
  res.sendStatus(200);
});

app.listen(1123);
