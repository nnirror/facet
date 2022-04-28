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
  addAnyHooks: (fp, hook_mode, command) => {
    if (!hook_mode) {
      if ( fp.hooks.length > 0 ) {
        for (var i = 0; i < fp.hooks.length; i++) {
          module.exports.hooks[fp.hooks[i]] = command;
        }
      }
    }
  },

  convertFlatSequenceToMessage: (flat_sequence) => {
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

  facetInit: () => {
    return {};
  },

  facets: {},

  flattenSequence: (sequence, max_sub_steps) => {
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

  getCommands: (user_input) => {
     return user_input.trim().split(';').filter(Boolean);
  },

  // returns the maximum number of sub-steps in a given pattern.
  // needed to calculate the resolution of a given row sequence when converting from
  // multi-dimensional array to wavetable buffer
  getMaximumSubSteps: (sequence) => {
    return Array.isArray(sequence) ?
      1 + Math.max(...sequence.map(module.exports.getMaximumSubSteps)) :
      0;
  },

  handleReruns: (statement) => {
   let rerun_regex = /.rerun\((.*?)\)/;
   let rerun_out = '';
   let statment_has_reruns = rerun_regex.test(statement);
   let rerun_datum, remove_last_paren = false;
   if ( statment_has_reruns ) {
     // this code is a bit wonky and should be checked more thoroughly but
     // seemingly handles the possibilities of
     // both numbers or commands being the argument of .rerun(), as well as
     // the possibility of commands continuing after .rerun(), or not.
     // . e.g. ".rerun(2);" or ".rerun(random(1,5,1)).gain(3);"
     let rerun_times = statement.split(rerun_regex)[1];
     if ( isNaN(rerun_times) ) {
       remove_last_paren = true;
       rerun_times = rerun_times + ')';
     }
     rerun_times = Math.abs(Math.round(eval(utils + rerun_times)));
     if (rerun_times < 1 ) {
       return statement;
     }
     let rerun_split = statement.split(rerun_regex)[0];
     let i = 0;
     rerun_out = rerun_split;
     while (i < rerun_times) {
       rerun_out += '.append(' + rerun_split + ')';
       i++;
     }
     // recurse until all instances of .rerun() have been replaced
     rerun_out = module.exports.handleReruns(rerun_out);
     return rerun_out;
   }
   else {
     return statement;
   }
  },

  hooks: {},

  initFacetDestination: (facets, destination) => {
    if ( !facets[destination] ) {
      facets[destination] = {};
    }
    return facets;
  },

  initStore: () => {
    fs.writeFileSync('stored.json', '{}');
  },

  removeTabsAndNewlines: (user_input) => {
    user_input = user_input.replace(/\s\s+/g, '');
    user_input = user_input.replace(/\'/g, '"');
    user_input = user_input.replace(/;/g, ';\n');
    return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
  },

  runCode: (code, hook_mode = false) => {
    let commands = [], destination, property, statement, ops_string,
    operations = [], max_sub_steps, flat_sequence, sequence_msg, current_command;
    // parse user input into individual operations on data.
    // run those operations, scale and flatten the resulting array,
    // and send that data into Max so it can go in a buffer wavetable
    user_input = commentStripper.stripComments(code);
    commands = module.exports.getCommands(code);
    if (commands[0] == 'mute()') {
      Max.outlet(`global mute`);
    }
    else {
      Object.values(commands).forEach(command => {
        command = module.exports.removeTabsAndNewlines(command);
        command = module.exports.handleReruns(command);
        let fp = eval(utils + command);
        if ( fp.skipped === true ) {
          // do nothing
        }
        else {
          module.exports.initFacetDestination(module.exports.facets, fp.name);
          module.exports.facets[fp.name]['data'] = fp.data;
          module.exports.addAnyHooks(fp, hook_mode, command);
          module.exports.storeAnyPatterns(fp);
          for (const [key, value] of Object.entries(module.exports.facets)) {
            for (const [k, facet_data] of Object.entries(value)) {
              let wav = new WaveFile();
              let data;
              // first check if a speed file exists - if not, create it
              wav.fromScratch(1, 44100, '32f', fp.phasor_speed);
              fs.writeFile(`../tmp/${key}_speed.wav`, wav.toBuffer(),(err) => {
                if (err) throw err;
                Max.outlet(`speed ${key}`);
              });
              // now create a mono wave file, 44.1 kHz, 32-bit floating point, with the entire request body of numbers
              for (var i = 0; i < facet_data.length; i++) {
                // convert every number in the wav buffer to 32-bit floating point. these numbers are allowed to be outside the [1.0 - -1.0] boundary
                facet_data[i] = Math.fround(parseFloat(facet_data[i]));
              }
              wav.fromScratch(1, 44100, '32f', facet_data);
              // store the wav in /tmp/ for access in Max
              fs.writeFile(`../tmp/${key}_${k}.wav`, wav.toBuffer(),(err) => {
                if (err) throw err;
                // file written successfully - send an update/speed command out so the facet_param object can read the new data for this dest/prop
                Max.outlet(`speed ${fp.name}`);
                Max.outlet(`update ${key}_data`);
              });
            }
          }
        }
      });
    }
    module.exports.facets = {};
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
    if ( module.exports.hooks[args[0]] ) {
      module.exports.runCode(module.exports.hooks[args[0]],true);
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

module.exports.facetInit();
module.exports.initStore();

// make the ../tmp/ directory if it doesn't exist
if ( !fs.existsSync('../tmp/')) {
    fs.mkdirSync('../tmp/');
};

app.post('/', (req, res) => {
  try {
    module.exports.runCode(req.body.code);
    res.sendStatus(200);
  } catch (e) {
    res.send({
      status: 400,
      error: `${e}, command: ${req.body.code}`
    });
  }
});

app.get('/hooks/mute', (req, res) => {
  module.exports.muteHooks();
});

app.get('/hooks/clear', (req, res) => {
  module.exports.clearHooks();
});

app.listen(1123);
