const fs = require('fs');
const wav = require("node-wav");
const fftjs = require('./fft.js');

module.exports = {

  replaceAll: function(string, search, replace) {
    return string.split(search).join(replace);
  },

  getDatum: function(value) {
    let datum_regex = /\[.*]\s*[\.;]/;
    let datum;

    let hard_coded_syntax_match = value.match(datum_regex);
    let generator_synax_split = value.split(datum_regex);
    if ( hard_coded_syntax_match ) {
      datum = hard_coded_syntax_match[0].slice(0,-1);
    }
    else if ( generator_synax_split ) {
      datum = generator_synax_split[0];
    }
    else {
      throw `Could not parse datum: ${value}`;
    }
    if ( module.exports.codeIsFunction(datum) ) {
      datum = datum.substring(1, datum.length-1);
      datum = datum.replace(/random/g, 'module.exports.random');
      datum = datum.replace(/choose/g, 'module.exports.choose');
      if (datum) {
        datum = eval(`module.exports.${datum}`);
      }
      else {
        datum = 0;
      }
    }
    else {
      datum = datum.trim();
      datum = module.exports.replaceAll(datum, ' ]', ']');
      datum = module.exports.replaceAll(datum, ' ', ',');
      datum = module.exports.replaceAll(datum, ' [', '[');
      datum = module.exports.replaceAll(datum, ',,', ',');
      datum = JSON.parse(datum);
    }
    return datum;
  },

  codeIsFunction: function(code) {
    let function_regex = /.*\(.*\)]/;
    if ( code.match(function_regex) ) {
      return true;
    }
    return false;
  },

  fileExists: function(url) {
      if ( url ) {
          var req = new XMLHttpRequest();
          req.open('GET', url, false);
          req.send();
          return req.status == 200;
      } else {
          return false;
      }
  },

  removeTabsAndNewlines: function (user_input) {
    // remove tabs, newlines, and multiple spaces. convert any single quotes to double quotes
    user_input = user_input.replace(/\s\s+/g, '');
    user_input = user_input.replace(/\'/g, '"');
    user_input = user_input.replace(/;/g, ';\n');
    return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
  },

  getDestination: function(code) {
    let every_n_regex = /every\(.*\)\s*/;
    code = code.trim();
    let contains_every_n_statement = code.match(every_n_regex);
    if ( contains_every_n_statement ) {
      // if there is an every() statement, destination is after that
      code = code.substring(code.indexOf(')') + 1).trim();
    }
    // split on whitespace
    return code.split(/\s+/)[0];
  },

  getProperty: function(code, destination) {
    // property is the string after the destination string and before the datum
    let dest_index = code.indexOf(destination);
    code = code.replace(destination, '').trim();
    code = code.substring(dest_index, code.length);
    code = code.split('[')[0].trim();
    return code;
  },

  getStatement: function(code, property) {
    let statement_regex = /\[.*]*/s;
    return code.match(statement_regex)[0];
  },

  parseStringOfOperations: function(value) {
    // everything after the period following the datum.
    // basically all the operations in string form. if no operations, returns empty string
    let post_datum_regex = /]\s*\..*[^;]/;
    let ops = value.match(post_datum_regex);
    if ( ops ) {
      return ops[0].slice(2);
    }
    else {
      return '';
    }
  },

  splitArguments: function(str) {
    let result = [], item = '', depth = 0;
    function arg_push() { if (item) result.push(item); item = ''; }
    for (let i = 0, c; c = str[i], i < str.length; i++) {
      if (!depth && c === '.') arg_push();
      else {
        item += c;
        if (c === '(') depth++;
        if (c === ')') depth--;
      }
    }
    arg_push();
    return result;
  },

  parseOperations: function(value) {
    let operations = [];
    // split the string of operations into an array, loop through
    // value = value.replaceAll('"', '');
    let split_ops = module.exports.splitArguments(value);
    for (let [k, d] of Object.entries(split_ops)) {
      let op = d.split('(')[0];
      let args = d.substring(
          // args is everything from the first to the last parenthesis
          d.indexOf("(") + 1,
          d.lastIndexOf(")"),
      );
      if ( !args.includes('(') && !args.includes(')') && !args.includes(',') ) {
          // if there are no functions aka parenthesis in the middle of the string,
        if ( typeof args == 'string' && args.length > 0 ) {
            // and global variable found - eval it
            args = eval(args);
        }
        // otherwise no need to eval any code -- simply push the pre-existing value into args
        operations.push({
          'op': op,
          'args': args
        });
      }
      else {
        try {
          // there is a function somewhere in the argument, so now we'll
          // attempt to eval the code, accounting for a few ways it could be structured
          let split_args = [];
          let multi_function_args = args.split(/(?<=\)\,)/);
          let multi_args = args.split(/,(?![^\(\[]*[\]\)])/);
          let args_array = [];
          if ( multi_function_args.length > 1 ) {
            // case: multiple functions as arguments
            args_array = multi_function_args;
          }
          else if ( multi_args.length > 1 ) {
            let rgs = [];
            for (let [x, y] of Object.entries(multi_args)) {
              rgs.push(y);
            }
            args_array = rgs
          }
          else {
            // case: function as only argument, just initialize the args array to that
            args_array = [args]
          }
          // however many arguments are now split into an array. loop through
          // them, eval them, and create a csv string of the evaled arguments
          let args_str = '';
          for (const [y, r] of Object.entries(args_array)) {
            // prevent any straggling trailing parens
            let valid_parsed_arg = r.replace('),',')');
            let evaled_arg;
            // if random/choose, run parsefloat.. which requires a reference to module.exports..
            if ( valid_parsed_arg.includes('random(') || valid_parsed_arg.includes('choose(') ) {
              evaled_arg = parseFloat(eval(`module.exports.${valid_parsed_arg}`));
            }
            else {
              // otherwise just eval it :D it's so simple...
              evaled_arg = parseFloat(eval(`${valid_parsed_arg}`));
            }
            if (isNaN(evaled_arg) ) {
              valid_parsed_arg = valid_parsed_arg.replace(/"/g,'');
              args_str += `${valid_parsed_arg},`;
            }
            else {
              args_str += `${evaled_arg.toFixed(4)},`;
            }
          }
          // remove last comma
          args_str = args_str.slice(0,-1);
          operations.push({
            'op': op,
            'args': args_str
          });
        } catch (er) {
          try {
            // case: with functions like am() or interlace(), which can take a generator as input,
            // it's also possible for an argument to be an entirely self-contained
            // statement, e.g:
            // [sine(1,100)]
            // *** here's what I mean ****
            // .am(sine(4,10).gain(random(0,1,0)));
            // **** end example ****
            // in that case, rerun the processCode() function (  recursively :D   )
            // insert a '[' at the beginning, and a ']' after the first instance of ').'
            // basically creates the structure needed to parse: [generator(2,3,3.5)].foo(1,2);
            let datum_from_args, processed_code_fom_args;
            let arg_has_operations = /\).*\./;
            if ( args.match(arg_has_operations) ) {
              // case: there are multiple chained operations in the argument
              if ( args.indexOf(').') > 0 ) {
                  args = args.replace(').', ')].');
              }
              else {
                  args += ']';
              }
              args = '[' + args;
              datum_from_args = module.exports.getDatum(args);
              processed_code_fom_args = module.exports.processCode(args, datum_from_args);
              if ( typeof processed_code_fom_args == 'number' ) {
                processed_code_fom_args = `[${c.toString()}]`;
              }
              else {
                for (var i = 0; i < processed_code_fom_args.length; i++) {
                  processed_code_fom_args[i] = processed_code_fom_args[i];
                }
                processed_code_fom_args = JSON.stringify(processed_code_fom_args);
              }
            }
            else {
              // case: the initial operation is the only argument
              args = '[' + args + ']';
              processed_code_fom_args = JSON.stringify(module.exports.getDatum(args));
            }
            operations.push({
              'op': op,
              'args': processed_code_fom_args
            });
          } catch (e) {
            throw(e);
            try {
              // case: arguments passed into a "sometimes" function
              // ultimately the argument should look like: [0.5, 'scale(-1,1).gain(0)']
              let sometimes_split_regex = /sometimes\(/;
              let sometimes_split = d.split(sometimes_split_regex);
              // remove the trailing ')' from the sometimes command
              let sometimes_args = `${sometimes_split[1].slice(0,sometimes_split[1].length-1)}`;
              sometimes_args = sometimes_args.replace(/\'/g, '"');
              sometimes_args = `[${sometimes_args}]`;
              // TODO: sometimes() does not handle dynamic arguments, like random(). Would require a more significant rewrite
              operations.push({
                'op': op,
                'args': sometimes_args
              });
            } catch (ee) {
              try {
                operations.push({
                  'op': op,
                  'args': ''
                });
              } catch (eee) {
                // "Please everybody, if we haven't done what we could have done, we've tried"
                throw `Could not parse argument: ${args}`;
              }
            }
          }
        }
      }
    };
    return operations;
  },

  runOperations: function(operations, datum) {
    for (const [key, op] of Object.entries(operations)) {
      if ( op.op == 'skip' ) {
        return 'SKIP';
      }
      var fn = module.exports[op.op];
      if ( typeof fn === 'function' ) {
        let args = [];
        args.push(datum);
        try {
          args.push(JSON.parse(op.args));
        } catch (e) {
          let args_split = op.args.split(',');
          for (var i = 0; i < args_split.length; i++) {
            args.push(args_split[i]);
          }
        }
        datum = fn.apply(null, args);
      }
    }
    // if the array exceeds 1024 values, re-scale it to 1024.
    return datum;
  },

  getCommands: function(user_input) {
    return user_input.trim().split(';').filter(Boolean);
  },

  createMultConnections: function(operations, destination, property) {
    let m = {};
    for (const [key, op] of Object.entries(operations)) {
      if ( op.op == 'mult' ) {
        let args = op.args;
        args = args.replace(/\'/g, '').replace(/"/g, '');
        let mult_destinaton = args.split(' ')[0];
        let mult_property = args.split(' ')[1];
        m[mult_destinaton] = {
          from_destination: destination,
          from_property: property,
          to_destination: mult_destinaton,
          to_property: mult_property
        }
      }
    }
    return m;
  },

  handleMultConnections: function(facets, mults) {
    for (const [key, mult] of Object.entries(mults)) {
      if ( !facets[mult.to_destination] ) {
        facets[mult.to_destination] = {};
      }
      facets[mult.to_destination][mult.to_property] = facets[mult.from_destination][mult.from_property];
    }
    return facets;
  },

  handleReruns: function(statement) {
    // any time a .rerun() command is found in the command,
    // get the entire statement up to that point, and rerun it however many times are specified,
    // replacing the .rerun() command with the actual rerun results, via .append(data([]))
    // whereas .dup() takes the result of a command and copies it n times,
    // .rerun() actually reruns the preceding command(s), so if they contain elements of chance,
    // each iteration of .rerun() will be potentially unique.
    let rerun_regex = /.rerun\((.*?)\)/;
    let statment_has_reruns = rerun_regex.test(statement);
    let rerun_datum, remove_last_paren = false;
    if ( statment_has_reruns ) {
      // this code is a bit wonky, but it handles all possibilities of
      // both numbers or commands being the argument of .rerun(), as well as
      // the possibility of commands continuing after .rerun(), or not.
      // . e.g. ".rerun(2);" or ".rerun(random(1,5,1)).gain(3);"
      let rerun_times = statement.split(rerun_regex)[1];
      if ( isNaN(rerun_times) ) {
        remove_last_paren = true;
        rerun_times = rerun_times + ')';
      }
      rerun_times = rerun_times.replace(/random/g, 'module.exports.random');
      rerun_times = rerun_times.replace(/choose/g, 'module.exports.choose');
      rerun_times = Math.abs(Math.round(eval(rerun_times)));
      if (rerun_times < 1 ) {
        return statement;
      }
      let rerun_split = statement.split(rerun_regex)[0];
      let i = 0;
      let rerun_out = '';
      while (i < rerun_times) {
        rerun_datum = module.exports.getDatum(rerun_split);
        // max 48000 to prevent humongous computation
        rerun_datum = module.exports.reduce(module.exports.processCode(rerun_split, rerun_datum),12000);
        rerun_out += `.append(data([${rerun_datum.toString()}]))`;
        i++;
      }
      if ( remove_last_paren ) {
        rerun_out = rerun_out.substring(0, rerun_out.lastIndexOf(")"),);
      }
      statement = statement.replace(rerun_regex, rerun_out);
      // recurse until all instances of .rerun() have been replaced
      statement = module.exports.handleReruns(statement);
    }
    return statement;
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

  processCode: function(statement, datum) {
    let ops_string, operations = [];
    ops_string = module.exports.parseStringOfOperations(statement);
    operations = module.exports.parseOperations(ops_string);
    datum = module.exports.runOperations(operations, datum);
    return datum;
  },

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

  // returns the maximum number of sub-steps in a given pattern.
  // needed to calculate the resolution of a given row sequence when converting from
  // multi-dimensional array to wavetable buffer
  getMaximumSubSteps: function (sequence) {
    return Array.isArray(sequence) ?
      1 + Math.max(...sequence.map(module.exports.getMaximumSubSteps)) :
      0;
  },
  // BEGIN  all modulators

  // BEGIN single-number operations
  // sequence is not needed as an argument for these in the actual code since it's added implicitly
  // in the runOperations functions
  random: function (min = 0, max = 1, int_mode = 0) {
    // returns number within range
    if ( int_mode != 1 && int_mode != 0 ) {
      throw `int_mode must be 1 or 0 if specified`;
    }
    let num = Math.random() * (Number(max) - Number(min)) + Number(min);
    if ( int_mode != 0 ) {
      num = Math.round(num);
    }
    return num;
  },

  choose: function (list) {
    let shuffled = module.exports.shuffle(list);
    return shuffled[0];
  },
  // END single-number operations

  // BEGIN pattern operations
  // sequence is always first argument, any additional arguments are after
  reverse: function (sequence) {
    let reversed_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        reversed_sequence[((sequence.length - 1) - key)] = module.exports.reverse(step);
      }
      else {
        reversed_sequence[((sequence.length - 1) - key)] = step;
      }
    }
    return reversed_sequence;
  },

  append: function (sequence1, sequence2) {
    return sequence1.concat(sequence2);
  },

  nest: function (sequence1, sequence2) {
    sequence1[sequence1.length] = sequence2;
    return sequence1;
  },

  skip: function (sequence) {
    return sequence;
  },

  changed: function (sequence) {
    let changed_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        changed_sequence[key] = module.exports.changed(step);
      }
      else {
        if ( key == 0 ) {
          if ( step == sequence[sequence.length - 1]) {
            changed_sequence[key] = 0;
          }
          else {
            changed_sequence[key] = 1;
          }
        }
        else {
          if ( step == sequence[key - 1]) {
            changed_sequence[key] = 0;
          }
          else {
            changed_sequence[key] = 1;
          }
        }
      }
    }
    return changed_sequence;
  },

  steps: [],
  stores: [],

  stepAs: function (sequence, user_defined_var) {
    // example: foo bar [noise(16)].stepAs('myNoise').gain(0.25)...;
    // global['myNoise'] can then be used as a variable in following function calls, and the stepAs() pattern will be stepped through
    // as Max continually pings the browser
    let step_obj = {
      name: user_defined_var,
      cur_step: 0,
      sequence: sequence
    }
    let matching_step_found = false;
    for (var i = 0; i < module.exports.steps.length; i++) {
      cur_step = module.exports.steps[i];
      if ( cur_step.name == user_defined_var ) {
        matching_step_found = true;
        module.exports.steps[i] = step_obj;
      }
    }
    if ( !matching_step_found ) {
      module.exports.steps.push(step_obj);
    }
    // now that the step pattern has been stored in module.exports.steps,
    // the pattern can return unchanged
    return sequence;
  },

  set: function (sequence, user_defined_var) {
    // example: foo bar [noise(16)].storeAs('myNoise').gain(0.25)...;
    // global['myNoise'] can then be used as a pattern in following function calls
    // the difference between this an mult, is that mult gets wiped every time commands are run.
    // storeAs remains around in global memory
    module.exports.stores[user_defined_var.trim()] = sequence;
    return sequence;
  },

  truncate: function (sequence, length) {
    if ( Number(length) <= 0 ) {
      return [];
    }
    return sequence.slice(0, Number(length));
  },

  palindrome: function (sequence) {
    return sequence.concat(module.exports.reverse(sequence));
  },

  dup: function (sequence, num) {
    return Array.from({length: Number(num+1)}).flatMap(a => sequence);
  },

  normalize: function (sequence) {
    // converts any sequence back into 0-1 range
    let normalized_sequence = [];
    let min = Math.min.apply(Math, sequence);
    let max = Math.max.apply(Math, sequence);
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        normalized_sequence[key] = module.exports.normalize(step);
      }
      else {
        normalized_sequence[key] = (step - min) / (max - min);
      }
    }
    return normalized_sequence;
  },

  audio: function(sequence) {
    return module.exports.scale(module.exports.normalize(sequence),-1,1);
  },

  echo: function (sequence, num) {
    num = Math.round(Math.abs(Number(num)));
    if ( num < 0 ) {
      num = Math.abs(num);
    }
    if ( num === 0 ) {
      return sequence;
    }
    let echo_sequence = module.exports.dup(sequence, num);
    let amplitude = 1;
    let count = 1;
    for (const [key, step] of Object.entries(echo_sequence)) {
      if ( count >= sequence.length ) {
        amplitude *= 0.666;
        count = 0;
      }
      if ( Array.isArray(step) ) {
        echo_sequence[key] = module.exports.echo(step, num);
      }
      else {
        echo_sequence[key] = amplitude * step;
      }
      count++;
    }
    return echo_sequence;
  },

  smooth: function (sequence) {
    let smoothed_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      let k = Number(key);
      if ( Array.isArray(step) ) {
        smoothed_sequence[k] = module.exports.smooth(step);
      }
      else {
        if ( k > 0 && ( (k + 1) < sequence.length ) ) {
          // all other steps
          smoothed_sequence[k] = (smoothed_sequence[k-1] + sequence[k+1]) / 2;
        }
        else if ( k +1 ==  sequence.length ) {
          // last step loops around to average with first
          smoothed_sequence[k] = (smoothed_sequence[k-1] + sequence[0]) / 2;
        }
        else {
          // first step is static
          smoothed_sequence[k] = step;
        }
      }
    }
    return smoothed_sequence;
  },

  curve: function (sequence, tension = 0.5, segments = 25) {
    // flatten the array to avoid nested arrays
    let curved_sequence = [];
    sequence = module.exports.flattenSequence(sequence, 0);
    // interlace a 0 for the x axis value of each sequence value
    let points = [];
    for (var i = 0; i < sequence.length; i++) {
      points.push(0);
      points.push(sequence[i]);
    }
    // run the curve function
    let splinePoints = module.exports.getCurvePoints(points, tension, segments, false);
    // deinterlace the 0s on the x axis
    for (var i = 0; i < splinePoints.length; i++) {
      if (i % 2 == 0 ) {
        continue;
      }
      curved_sequence.push(splinePoints[i]);
    }
    return curved_sequence;
  },

  slew: function (sequence, depth = 25, up_speed = 1, down_speed = 1) {
    let slewed_sequence = [];
    up_speed = module.exports.clip([Math.abs(Number(up_speed))],0,1)[0];
    down_speed = module.exports.clip([Math.abs(Number(down_speed))],0,1)[0];
    depth = Math.round(Math.abs(Number(depth)));
    for (const [key, step] of Object.entries(sequence)) {
      let k = Number(key);
      if ( Array.isArray(step) ) {
        slewed_sequence.push(module.exports.slew(step, depth, up_speed, down_speed));
      }
      else {
          // check if next step up or down
          // if up, run from this step to next step in (up_speed * depth) samples, then hold for rest of depth
          // if down, run from this step to next step in (down_speed * depth) samples, then hold for rest of depth
        if ( !isNaN(sequence[k+1]) ) {
          if ( sequence[k+1] > sequence[k] ) {
            // up
            for (var i = 0; i < depth; i++) {
              if ( i < Math.round(up_speed * depth) ) {
                // up slew
                slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[k+1]) * (i/Math.round(up_speed * depth)))));
              }
              else {
                // hold
                slewed_sequence.push(sequence[k+1]);
              }
            }
          }
          else if ( sequence[k+1] < sequence[k] ) {
            // down
            for (var i = 0; i < depth; i++) {
              if ( i < Math.round(down_speed * depth) ) {
                // down slew
                slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[k+1]) * (i/Math.round(up_speed * depth)))));
              }
              else {
                // hold
                slewed_sequence.push(sequence[k+1]);
              }
            }
          }
          else {
            // static
            for (var i = 0; i < depth; i++) {
              slewed_sequence.push(sequence[k]);
            }
          }
        }
        else {
          // going back to first val
          if ( sequence[0] > sequence[k] ) {
            // up
            for (var i = 0; i < depth; i++) {
              if ( i < Math.round(up_speed * depth) ) {
                // up slew
                slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[0]) * (i/Math.round(up_speed * depth)))));
              }
              else {
                // hold
                slewed_sequence.push(sequence[0]);
              }
            }
          }
          else if ( sequence[0] < sequence[k] ) {
            // down
            for (var i = 0; i < depth; i++) {
              if ( i < Math.round(down_speed * depth) ) {
                // down slew
                slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[0]) * (i/Math.round(up_speed * depth)))));
              }
              else {
                // hold
                slewed_sequence.push(sequence[0]);
              }
            }
          }
          else {
            // static
            for (var i = 0; i < depth; i++) {
              slewed_sequence.push(sequence[0]);
            }
          }
        }
      }
    }
    return slewed_sequence;
  },

  equals: function (sequence1, sequence2) {
    sequence1 = module.exports.flattenSequence(sequence1,0);
    sequence2 = module.exports.flattenSequence(sequence2,0);
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence1, sequence2);
    sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1)) {
      if ( Array.isArray(step) ) {
        sequence1[key] = module.exports.equals(step, sequence2[key]);
      }
      else {
        if ( step == sequence2[key] ) {
          sequence1[key] = 1;
        }
        else {
          sequence1[key] = 0;
        }
      }
    }
    return sequence1;
  },

  and: function (sequence1, sequence2) {
    sequence1 = module.exports.flattenSequence(sequence1,0);
    sequence2 = module.exports.flattenSequence(sequence2,0);
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence1, sequence2);
    sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1)) {
      if ( Array.isArray(step) ) {
        sequence1[key] = module.exports.and(step, sequence2[key]);
      }
      else {
        if ( step != 0 && sequence2[key] != 0 ) {
          sequence1[key] = 1;
        }
        else {
          sequence1[key] = 0;
        }
      }
    }
    return sequence1;
  },

  or: function (sequence1, sequence2) {
    sequence1 = module.exports.flattenSequence(sequence1,0);
    sequence2 = module.exports.flattenSequence(sequence2,0);
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence1, sequence2);
    sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1)) {
      if ( Array.isArray(step) ) {
        sequence1[key] = module.exports.or(step, sequence2[key]);
      }
      else {
        if ( step != 0 || sequence2[key] != 0 ) {
          sequence1[key] = 1;
        }
        else {
          sequence1[key] = 0;
        }
      }
    }
    return sequence1;
  },

  add: function (sequence1, sequence2) {
    sequence1 = module.exports.flattenSequence(sequence1,0);
    sequence2 = module.exports.flattenSequence(sequence2,0);
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence1, sequence2);
    sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1)) {
      if ( Array.isArray(step) ) {
        sequence1[key] = module.exports.plus(step, sequence2[key]);
      }
      else {
        sequence1[key] = sequence1[key] + sequence2[key];
      }
    }
    return sequence1;
  },

  subtract: function (sequence1, sequence2) {
    sequence1 = module.exports.flattenSequence(sequence1,0);
    sequence2 = module.exports.flattenSequence(sequence2,0);
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence1, sequence2);
    sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1)) {
      if ( Array.isArray(step) ) {
        sequence1[key] = module.exports.subtract(step, sequence2[key]);
      }
      else {
        sequence1[key] = sequence1[key] - sequence2[key];
      }
    }
    return sequence1;
  },

  times: function (sequence1, sequence2) {
    sequence1 = module.exports.flattenSequence(sequence1,0);
    sequence2 = module.exports.flattenSequence(sequence2,0);
    let out = [];
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence1, sequence2);
    sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1)) {
      if ( Array.isArray(step) ) {
        sequence1[key] = module.exports.times(step, sequence2[key]);
      }
      else {
        out[key] = sequence1[key] * sequence2[key];
      }
    }
    return out;
  },

  divide: function (sequence1, sequence2) {
    sequence1 = module.exports.flattenSequence(sequence1,0);
    sequence2 = module.exports.flattenSequence(sequence2,0);
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence1, sequence2);
    sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1)) {
      if ( Array.isArray(step) ) {
        sequence1[key] = module.exports.divide(step, sequence2[key]);
      }
      else {
        sequence1[key] = sequence1[key] / sequence2[key];
      }
    }
    return sequence1;
  },

  makeArraysTheSameSize: function (sequence1, sequence2) {
    // first, make both arrays as big as possible in relation to each other while preserving all values & scale
    // so if one array was 100 and the other 250, this would convert them to 200 and 250
    if ( sequence1.length > sequence2.length ) {
      sequence2 = module.exports.scaleTheArray(sequence2, parseInt(sequence1.length / sequence2.length));
    }
    else if ( sequence2.length > sequence1.length ) {
      sequence1 = module.exports.scaleTheArray(sequence1, parseInt(sequence2.length / sequence1.length));
    }
    // then reduce the bigger array to smaller one's size
    if ( sequence1.length > sequence2.length ) {
      sequence1 = module.exports.reduce(sequence1, sequence2.length);
    }
    else if ( sequence2.length > sequence1.length ) {
      sequence2 = module.exports.reduce(sequence2, sequence1.length);
    }
    return [sequence1, sequence2];
  },

  scaleTheArray: function (arrayToScale, nTimes) {
      nTimes-= 1;
      for (var idx = 0, i = 0, len = arrayToScale.length * nTimes; i < len; i++) {
        var elem = arrayToScale[idx];

        /* Insert the element into (idx + 1) */
        arrayToScale.splice(idx + 1, 0, elem);

        /* Add idx for the next elements */
        if ((i + 1) % nTimes === 0) {
          idx += nTimes + 1;
        }
      }
      return arrayToScale;
  },

  flipBelow: function (sequence, min) {
    min = Number(min);
    let flipped_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        flipped_sequence[key] = module.exports.flipBelow(step, min);
      }
      else {
        if ( step < min ) {
          let amount_below = Math.abs(Number(min) - Number(step));
          flipped_sequence[key] = min + amount_below;
        }
        else {
          flipped_sequence[key] = step;
        }
      }
    }
    return flipped_sequence;
  },

  flipAbove: function (sequence, maximum) {
    maximum = Number(maximum);
    let flipped_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        flipped_sequence[key] = module.exports.flipAbove(step, maximum);
      }
      else {
        if ( step > maximum ) {
          let amount_above = Math.abs(Number(step) - Number(maximum));
          flipped_sequence[key] = maximum - amount_above;
        }
        else {
          flipped_sequence[key] = step;
        }
      }
    }
    return flipped_sequence;
  },

  quantize: function (sequence, resolution) {
    resolution = parseInt(Number(resolution));
    let quantized_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        quantized_sequence[key] = module.exports.quantize(step, resolution);
      }
      else {
        if ( key % resolution == 0 ) {
          // only pass nonzero steps if the modulo of their key is 0
          quantized_sequence[key] = step;
        }
        else {
          quantized_sequence[key] = 0;
        }
      }
    }
    return quantized_sequence;
  },

  interlace: function (sequence1, sequence2) {
      let interlaced_sequence = [];
      let interlace_every;
      let big_sequence = sequence1, small_sequence = sequence2;
      if ( sequence1.length > sequence2.length ) {
        interlace_every = parseInt(sequence1.length / sequence2.length);
        big_sequence = module.exports.reduce(sequence1, sequence2.length);
        small_sequence = sequence2;
      }
      else if ( sequence2.length > sequence1.length ) {
        interlace_every = parseInt(sequence2.length / sequence1.length);
        big_sequence = module.exports.reduce(sequence2, sequence1.length);
        small_sequence = sequence1;
      }
      else if ( sequence2.length == sequence1.length ) {
          interlace_every = 1;
      }
      for (const [key, step] of Object.entries(big_sequence)) {
        interlaced_sequence.push(big_sequence[key]);
        if ( Number(key) % interlace_every == 0 ) {
          if ( isNaN(small_sequence[key]) ) {
            interlaced_sequence.push(0)
          }
          else {
            interlaced_sequence.push(small_sequence[key]);
          }
        }
      }
      return interlaced_sequence;
  },

  markov: function(sequence_name, prob, amt) {
    amt = Number(amt);
    prob = Number(prob);
    let markov_sequence = module.exports.get(sequence_name);
    markov_sequence = module.exports.jam(markov_sequence, prob, amt);
    module.exports.set(markov_sequence, sequence_name);
    return markov_sequence;
  },

  jam: function (sequence, prob, amt) {
    amt = Number(amt);
    prob = Number(prob);
    let jammed_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        jammed_sequence[key] = module.exports.jam(step, prob, amt);
      }
      else {
        if ( step != 0 ) {
          if ( Math.random() < prob) {
            // changed
            let step_distance = Math.random() * amt;
            // half the time make it smaller
            if ( Math.random() < 0.5 ) {
              step_distance *= -1;
            }
            jammed_sequence[key] = Number((Number(step) + Number(step_distance)).toFixed(4));
          }
          else {
            // unchanged
            jammed_sequence[key] = step;
          }
        }
        else {
          // unchanged
          jammed_sequence[key] = step;
        }
      }
    }
    return jammed_sequence;
  },

  walk: function (sequence, prob, amt) {
    // swap some of the locations
    let jammed_sequence = [];
    let x_max = sequence.length - 1;
    amt = Number(amt);
    prob = Number(prob);
    if ( prob < 0 ) {
      prob = 0;
    }
    else if ( prob > 1 ) {
      prob = 1;
    }
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        jammed_sequence[key] = module.exports.walk(step, prob, amt);
      }
      else {
        if ( Math.random() < prob) {
          // changed
          let step_distance = parseInt((Math.random() * amt).toFixed());
          if ( step_distance < 1 ) {
            step_distance = 1;
          }
          // half the time make it smaller
          if ( Math.random() < 0.5 ) {
            step_distance = step_distance * -1;
          }
          let new_step_location = parseInt(key) + parseInt(step_distance);
          if (new_step_location < 0) {
            new_step_location = x_max - (0 - new_step_location) % (x_max - 0);
          }
          else {
            new_step_location = 0 + (new_step_location - 0) % (x_max - 0);
          }
          jammed_sequence[key] = sequence[new_step_location];
          jammed_sequence[new_step_location] = step;
        }
        else {
          // unchanged
          jammed_sequence[key] = step;
        }
      }
    }
    return jammed_sequence;
  },

  recurse: function (sequence, prob) {
    // there is no need for the input to this function to ever be huge, and it would
    // be dangerous to remove the limits - could easily max out CPU. remove at your own risk lol
    sequence = module.exports.reduce(sequence,1024);
    prob = Number(prob);
    if ( prob < 0 ) {
      prob = 0;
    }
    else if ( prob > 1 ) {
      prob = 1;
    }
    let recursive_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        recursive_sequence[key] = module.exports.recurse(step, prob);
      }
      else {
        if ( (Math.random() < prob) ) {
          // get two random points in the sequence, and re-insert everything
          // between those two points in this location
          let sub_selection = [];
          let point1 = Math.floor(Math.random() * sequence.length);
          let point2 = Math.floor(Math.random() * sequence.length);
          let points = [point1, point2];
          let sorted_points = points.sort(function(a,b) { return a - b;});
          let i = sorted_points[0];
          while (i <= sorted_points[1] ) {
            sub_selection.push(sequence[i]);
            i++;
          }
          recursive_sequence[key] = sub_selection;
        }
        else {
          recursive_sequence[key] = step;
        }
      }
    }
    return recursive_sequence;
  },

  prob: function (sequence, amt) {
    amt = Number(amt);
    if ( amt < 0 ) {
      amt = 0;
    }
    else if ( amt > 1 ) {
      amt = 1;
    }
    let prob_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        prob_sequence[key] = module.exports.prob(step, amt);
      }
      else {
        if ( Math.random() < amt ) {
          prob_sequence[key] = step;
        }
        else {
          prob_sequence[key] = 0;
        }
      }
    }
    return prob_sequence;
  },

  offset: function (sequence, amt) {
    amt = Number(amt);
    let offset_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        offset_sequence[key] = module.exports.offset(step, amt);
      }
      else {
        offset_sequence[key] = Number(step) + Number(amt);
      }
    }
    return offset_sequence;
  },

  pong: function (sequence, min, max) {
    min = Number(min);
    max = Number(max);
    let range = [min, max];
    let sorted_range = range.sort(function(a,b) { return a - b;});
    min = sorted_range[0];
    max = sorted_range[1];
    if ( min == max ) {
      throw `Cannot run pong with equal min and max: ${min}`;
    }
    let pong_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        pong_sequence[key] = module.exports.pong(step, min, max);
      }
      else {
        let new_step = step;
        let step_is_outside_range = ((step < min) || (step > max));
        while (step_is_outside_range) {
          if ( new_step < min )  {
            new_step = max - Math.abs(new_step - min);
          }
          else if ( new_step > max ) {
            new_step = min + Math.abs(new_step - max);
          }
          step_is_outside_range = ((new_step < min) || (new_step > max));
        }
        pong_sequence[key] = new_step;
      }
    }
    return pong_sequence;
  },

  sometimes: function (sequence, prob, command) {
    prob = Math.abs(Number(prob));
    command = command.trim();
    if ( Math.random() < prob ) {
      operations = module.exports.parseOperations(command);
      sequence = module.exports.runOperations(operations, sequence);
    }
    return sequence;
  },

  fft: function (sequence) {
    let fft_sequence = [];
    let complex_fft_sequence = [];
    let next_power_of_2 = module.exports.nextPowerOf2(sequence.length);
    let power2_sequence = new Array(next_power_of_2);
    for (var i = 0; i < power2_sequence.length; i++) {
      if ( sequence[i] ) {
        power2_sequence[i] = sequence[i];
      }
      else {
        power2_sequence[i] = 0;
      }
    }
    complex_fft_sequence = fftjs.cfft(power2_sequence);
    for (var i = 0; i < complex_fft_sequence.length; i++) {
      let n = complex_fft_sequence[i].re;
      if ( isNaN(n)) {
        n = 0;
      }
      fft_sequence.push(n);
    }
    return fft_sequence;
  },

  nextPowerOf2: function (n) {
      var count = 0;
      if ( n && ! ( n & ( n - 1 ))) {
        return n;
      }
      while ( n != 0) {
        n >>= 1;
        count += 1;
      }
      return 1 << count;
  },

  fracture: function (sequence, pieces) {
    pieces = Math.round(Math.abs(Number(pieces)));
    let fracture_sequence = [];
    let break_points = [];
    for (var i = 0; i < pieces; i++) {
      break_points.push(Math.floor(Math.random() * sequence.length));
    }
    break_points = module.exports.sort(break_points);
    let prev_point = 0;
    let chunks = [];
    let chunk = [];
    for (var i = 0; i < sequence.length; i++) {
      chunk.push(sequence[i]);
      for (var a = 0; a < break_points.length; a++) {
        if ( break_points[a] == i || i == (sequence.length - 1)) {
          chunks.push(chunk);
          chunk = [];
          break;
        }
      }
    }
    chunks = module.exports.shuffleArray(chunks);
    for (var i = 0; i < chunks.length; i++) {
      chunk = chunks[i];
      for (var a = 0; a < chunk.length; a++) {
        fracture_sequence.push(chunk[a]);
      }
    }
    return fracture_sequence;
  },

  getchunks: function(sequence, num_chunks) {
    let chunk_size = sequence.length / parseInt(num_chunks);
    let window_size = parseInt((sequence.length / num_chunks) * 0.04);
    let chunked_sequence = [];
    let chunk_obj = {
      pre: [],
      chunk: [],
      post: []
    };
    for (var i = 0; i < sequence.length; i++) {
      chunk_obj.chunk.push(sequence[i]);
      if ( ( chunk_obj.chunk.length >= chunk_size ) || (i == (sequence.length - 1)) ) {
        // pre should always start at window_size before
        let pre = i - window_size;
        if ( pre < 0 ) {
          pre = chunk_obj.chunk.length + pre;
        }
        v = 0;
        while ( v < window_size ) {
          chunk_obj.pre.push(sequence[pre+v]);
          v++;
        }
        for (var x = i; x < i + window_size; x++) {
          let calc_x = x;
          if (calc_x >= sequence.length ) {
            calc_x = Math.abs(calc_x - sequence.length);
          }
          chunk_obj.post.push(sequence[calc_x]);
        }
        chunked_sequence.push(chunk_obj);
        chunk_obj = {
          pre: [],
          chunk: [],
          post: []
        };
      }
    }
    return chunked_sequence;
  },

  rechunk: function(sequence, chunks = 8) {
    chunks = Math.round(Math.abs(Number(chunks)));
    let chunked_sequence = module.exports.shuffleArray(module.exports.getchunks(sequence, chunks));
    let rechunk_sequence = [];
    let chunk = [];
    let pre_chunk = [];
    let post_chunk = [];
    let window_size = chunked_sequence[0].post.length;
    let window_amts = module.exports.reverse(module.exports.range(module.exports.sine(1,window_size*2),0,0.5));
    for (var i = 0; i < chunked_sequence.length; i++) {
      chunk = chunked_sequence[i].chunk;
      let next = i+1 >= chunked_sequence.length ? 0 : i+1;
      pre_chunk = chunked_sequence[next].pre;
      post_chunk = chunked_sequence[i].post;
      for (var a = 0; a < (chunk.length - window_size); a++) {
        rechunk_sequence.push(chunk[a]);
      }
      for (var a = 0; a < post_chunk.length; a++) {
        let post_window_mix = parseFloat(window_amts[a]);
        let pre_window_mix = Math.abs(1-post_window_mix);
        rechunk_sequence.push(((post_chunk[a] * post_window_mix)) + ((pre_chunk[a] * pre_window_mix)));
      }
    }
    return rechunk_sequence;
  },

  ichunk: function(sequence, sequence2) {
    sequence2 = module.exports.reduce(sequence2, 512);
    let chunks = sequence2.length;
    let chunked_sequence = module.exports.getchunks(sequence, chunks);
    let ichunk_sequence = [];
    let chunk = [];
    let pre_chunk = [];
    let post_chunk = [];
    let window_size = chunked_sequence[0].post.length;
    let window_amts = module.exports.reverse(module.exports.range(module.exports.sine(1,window_size*2),0,0.5));
    let calc_chunk_index;
    for (var i = 0; i < chunks; i++) {
      calc_chunk_index = Math.floor(sequence2[i] * (chunks - 1));
      if (!chunked_sequence[calc_chunk_index]) {
        continue;
      }
      if (!chunked_sequence[i]) {
        continue;
      }
      chunk = chunked_sequence[calc_chunk_index].chunk;
      let next = i+1 >= chunked_sequence.length ? 0 : i+1;
      pre_chunk = chunked_sequence[next].pre;

      post_chunk = chunked_sequence[i].post;
      for (var a = 0; a < (chunk.length - window_size); a++) {
        ichunk_sequence.push(chunk[a]);
      }
      for (var a = 0; a < post_chunk.length; a++) {
        let post_window_mix = parseFloat(window_amts[a]);
        let pre_window_mix = Math.abs(1-post_window_mix);
        ichunk_sequence.push(((post_chunk[a] * post_window_mix)) + ((pre_chunk[a] * pre_window_mix)));
      }
    }
    return ichunk_sequence;
  },

  harmonics: function(sequence, ctrl_sequence) {
    amplitude = 0.9;
    let harmonics_array = [];
    let harmonics_sequence = [];
    ctrl_sequence = module.exports.reduce(ctrl_sequence,32);
    for (var i = 0; i < ctrl_sequence.length; i++) {
      let harmonic_gain = Math.pow(amplitude, i);
      let harmonic = [];
      let ratio = parseFloat(ctrl_sequence[i]);
      let num_loops = Math.floor(ratio);
      let fraction_loop = Math.floor((ratio - num_loops) * sequence.length);
      for (var a = 0; a < num_loops; a++) {
        for (var b = 0; b < sequence.length; b++) {
          harmonic.push(sequence[b] * harmonic_gain);
        }
      }
      for (var c = 0; c < fraction_loop; c++) {
        harmonic.push(sequence[c] * harmonic_gain);
      }
      harmonics_array.push(module.exports.reduce(harmonic, sequence.length));
    }
    for (var i = 0; i < harmonics_array.length; i++) {
      var h = harmonics_array[i];
      for (var a = 0; a < h.length; a++) {
        var h_samp = h[a];
        if (!harmonics_sequence[a] ) {
          harmonics_sequence[a] = h_samp;
        }
        else {
          harmonics_sequence[a] += h_samp;
        }
      }
    }
    return module.exports.scale(harmonics_sequence,-1,1);
  },

  sieve: function(sequence, sequence2) {
    let sieve_sequence = [];
    sequence2 = module.exports.normalize(sequence2);
    for (var i = 0; i < sequence2.length; i++) {
      sieve_sequence.push(sequence[Math.round(sequence2[i] * (sequence.length - 1))]);
    }
    return sieve_sequence;
  },

  mutechunks: function(sequence, chunks, prob) {
    if ( !chunks ) {
      chunks = 16;
    }
    if ( !prob ) {
      prob = 0.75;
    }
    let mutechunk_sequence = module.exports.getchunks(sequence, parseInt(chunks));
    let out = [];
    let window_size = parseInt((sequence.length / chunks) * 0.02);
    let window_amts = module.exports.reverse(module.exports.range(module.exports.sine(1,window_size*2),0,0.5));
    let chunk;
    let pre_chunk;
    let post_chunk;
    // first loop through and "fade" some by setting their pre/chunk/post to 0
    for (var i = 0; i < mutechunk_sequence.length; i++) {
      chunk = mutechunk_sequence[i].chunk;
      pre_chunk = mutechunk_sequence[i].pre;
      post_chunk = mutechunk_sequence[i].post;
      if ( Math.random() < parseFloat(prob) ) {
        mutechunk_sequence[i].pre = [];
        mutechunk_sequence[i].chunk = [];
        mutechunk_sequence[i].post = [];
        for (var a = 0; a < pre_chunk.length; a++) {
          mutechunk_sequence[i].pre.push(0);
        }
        for (var a = 0; a < chunk.length; a++) {
          mutechunk_sequence[i].chunk.push(0);
        }
        for (var a = 0; a < post_chunk.length; a++) {
          mutechunk_sequence[i].post.push(0);
        }
      }
    }
    // then loop through to interp out
    for (var i = 0; i < mutechunk_sequence.length; i++) {
      chunk = mutechunk_sequence[i].chunk;
      let next = i >= (mutechunk_sequence.length - 1) ? 0 : i + 1;
      pre_chunk = mutechunk_sequence[next].pre;
      post_chunk = mutechunk_sequence[i].post;
      for (var a = 0; a < (chunk.length - window_size); a++) {
        out.push(chunk[a]);
      }
      for (var a = 0; a < post_chunk.length; a++) {
        let post_window_mix = parseFloat(window_amts[a]);
        let pre_window_mix = Math.abs(1-post_window_mix);
        out.push(parseFloat((post_chunk[a] * post_window_mix)) + parseFloat((pre_chunk[a] * pre_window_mix)));
      }
    }
    // phase rotate to handle windows
    out = module.exports.shift(out, window_size / out.length);
    return out;
  },

  shuffleArray: function (array) {
    // only for shuffling the outer-most level elements... added in for fracture
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
  },

  spiral: function (length, angle_degrees = 137.5) {
    let spiral_sequence = [], i = 1, angle = 0;
    angle_degrees = Math.abs(Number(angle_degrees));
    length = Math.abs(Number(length));
    while ( i <= length ) {
      angle += angle_degrees;
      if (angle > 359) {
        angle = Math.abs(360 - angle);
      }
      // convert degrees back to radians, and then to a 0. - 1. range
      spiral_sequence.push( (angle * (Math.PI/180) ) / (Math.PI * 2) );
      i++;
    }
    return spiral_sequence;
  },

  map: function (sequence, new_values) {
    sequence = module.exports.flattenSequence(sequence,0);
    new_values = module.exports.flattenSequence(new_values,0);
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence, new_values);
    sequence = same_size_arrays[0];
    same_size_arrays = same_size_arrays[1];
    let mapped_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        mapped_sequence[key] = module.exports.map(step, new_values);
      }
      else {
        mapped_sequence[key] = new_values.reduce((a, b) => {
          return Math.abs(b - step) < Math.abs(a - step) ? b : a;
        });
      }
    }
    return mapped_sequence;
  },

  unique: function (sequence) {
     return Array.from(new Set(sequence));
  },

  abs: function (sequence) {
    let abs_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        abs_sequence[key] = module.exports.abs(step, amt);
      }
      else {
        abs_sequence[key] = Math.abs(step);
      }
    }
    return abs_sequence;
  },

  gt: function (sequence, amt) {
    let gt_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        gt_sequence[key] = module.exports.gt(step, amt);
      }
      else {
        gt_sequence[key] = (Number(step) > Number(amt)) ? 1 : 0;
      }
    }
    return gt_sequence;
  },

  gte: function (sequence, amt) {
    let gte_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        gte_sequence[key] = module.exports.gte(step, amt);
      }
      else {
        gte_sequence[key] = (Number(step) >= Number(amt)) ? 1 : 0;
      }
    }
    return gte_sequence;
  },

  lt: function (sequence, amt) {
    let lt_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        lt_sequence[key] = module.exports.lt(step, amt);
      }
      else {
        lt_sequence[key] = (Number(step) < Number(amt)) ? 1 : 0;
      }
    }
    return lt_sequence;
  },

  lte: function (sequence, amt) {
    let lte_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        lte_sequence[key] = module.exports.lte(step, amt);
      }
      else {
        lte_sequence[key] = (Number(step) <= Number(amt)) ? 1 : 0;
      }
    }
    return lte_sequence;
  },

  modulo: function (sequence, amt) {
    let modulo_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        modulo_sequence[key] = module.exports.modulo(step, amt);
      }
      else {
        modulo_sequence[key] = Number(step) % Number(amt);
      }
    }
    return modulo_sequence;
  },

  gain: function (sequence, amt) {
    let gain_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        gain_sequence[key] = module.exports.gain(step, amt);
      }
      else {
        gain_sequence[key] = (Number(step) * Number(amt));
      }
    }
    return gain_sequence;
  },

  reduce: function (sequence, new_size) {
    let orig_size = sequence.length;
    new_size = Number(new_size);
    if ( new_size > orig_size ) {
      return sequence;
    }
    let reduced_sequence = [];
    for ( let i = 0; i < new_size; i++ ) {
      let large_array_index = Math.floor(i * (orig_size + Math.floor(orig_size / new_size)) / new_size);
      reduced_sequence[i] = sequence[large_array_index];
    }
    return reduced_sequence;
  },

  shuffle: function (sequence) {
    let shuffle_sequence = sequence;
    for (let i = shuffle_sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffle_sequence[i], shuffle_sequence[j]] = [shuffle_sequence[j], shuffle_sequence[i]];
    }
    for (const [key, step] of Object.entries(shuffle_sequence)) {
      if ( Array.isArray(step) ) {
        shuffle_sequence[key] = module.exports.shuffle(step);
      }
    }
    return shuffle_sequence;
  },

  round: function (sequence) {
    let rounded_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        rounded_sequence[key] = module.exports.round(step);
      }
      else {
        rounded_sequence[key] = Math.round(step);
      }
    }
    return rounded_sequence;
  },

  sort: function (sequence) {
    let sorted_sequence = [];
    sorted_sequence = sequence.sort(function(a, b) {
      return a - b;
    });
    for (const [key, step] of Object.entries(sorted_sequence)) {
      if ( Array.isArray(step) ) {
        sorted_sequence[key] = module.exports.sort(step);
      }
    }
    return sorted_sequence;
  },

  log: function (sequence, base, rotation = 1) {
      return module.exports.warp(sequence, base, rotation);
  },

  pow: function (sequence, base, rotation = 1) {
      return module.exports.reverse(module.exports.invert(module.exports.warp(sequence, base, rotation)));
  },

  warp: function (sequence, base, rotation = 1) {
    // forked from: https://github.com/naomiaro/fade-curves/blob/master/index.js
    let warp_sequence = [];
    let length = sequence.length;
    base = Math.abs(Number(base));
    rotation = Number(rotation);
    let curve = new Float32Array(length), index, x = 0, i;
    // create a curve that will be used to look up the original pattern's keys nonlinearly
    for ( i = 0; i < length; i++ ) {
      index = rotation > 0 ? i : length - 1 - i;
      x = i / length;
      curve[index] = Math.log(1 + base * x) / Math.log(1 + base);
    }
    // loop through the curve, pushing the corresponding pattern keys into the warped structure
    for (var a = 0; a < length; a++) {
      foo = Math.round(Number(curve[a]) * length);
      if (foo >= sequence.length ) {
          foo = sequence.length - 1;
      }
      if ( Array.isArray(sequence[foo]) ) {
        warp_sequence[a] = module.exports.warp(sequence[foo], base, rotation);
      }
      else {
        warp_sequence[a] = sequence[foo];
      }
    }
    return warp_sequence;
  },

  subset: function (sequence, percentage) {
    percentage = Number(percentage);
    if ( percentage < 0 ) {
      percentage = 0;
    }
    else if ( percentage > 1 ) {
      percentage = 1;
    }
    let subset_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        subset_sequence[key] = module.exports.subset(step, percentage);
      }
      else {
        if ( Math.random() < percentage ) {
          subset_sequence.push(step);
        }
      }
    }
    return subset_sequence;
  },

  range: function (sequence, new_min, new_max) {
    // this is a horizontal range - returns a range of the buffer
    min = parseInt(Number(new_min) * sequence.length);
    max = parseInt(Number(new_max) * sequence.length);
    if (max < min) {
      max = parseInt(Number(new_min) * sequence.length);;
      min = parseInt(Number(new_max) * sequence.length);;
    }
    let range_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        range_sequence[key] = module.exports.range(step, Number(new_min), Number(new_max));
      }
      else {
        if ( Number(key) >= min && Number(key) <= max ) {
          range_sequence.push(step);
        }
      }
    }
    return range_sequence;
  },

  shift: function (sequence, amt) {
    let moved_sequence = [];
    amt = Number(amt);
    // wrap the phase shift amount between -1 and 1
    if (amt < -1 || amt > 1 ) {
      let new_amt = amt;
      let amt_is_outside_range = ((amt < -1) || (amt > 1));
      while (amt_is_outside_range) {
        if ( new_amt < -1 )  {
          new_amt = 1 - Math.abs(new_amt - -1);
        }
        else if ( new_amt > 1 ) {
          new_amt = -1 + Math.abs(new_amt - 1);
        }
        amt_is_outside_range = ((new_amt < -1) || (new_amt > 1));
      }
      amt = new_amt;
    }

    // moving left require the keys to become bigger, but the argument makes more sense
    // when moving left is negative, hence the * - 1 here.
    direction = -1 * (amt * sequence.length);
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        moved_sequence[key] = module.exports.shift(step, direction);
      }
      else {
        let new_key = Math.round(Number(key) + Number(direction));
        if ( new_key < 0 ) {
          // wrap to end
          new_key = sequence.length - (Math.abs(new_key));
        }
        else if ( new_key >= sequence.length ) {
          // wrap to beginning
          new_key = Math.abs((sequence.length + 1) - new_key);
        }
        moved_sequence[key] = sequence[new_key];
      }
    }
    return moved_sequence;
  },

  nonzero: function (sequence) {
      let nonzero_sequence = [];
      let prev_val;
      let cur_val;
      for (const [key, step] of Object.entries(sequence)) {
        if ( Array.isArray(step) ) {
          nonzero_sequence[key] = module.exports.nonzero(step);
        }
        else {
          cur_val = step;
          if ( Number(cur_val) == 0 ) {
              if ( prev_val ) {
                  cur_val = prev_val;
              }
              else {
                  continue;
              }
          }
          else {
              prev_val = step;
          }
          nonzero_sequence[key] = cur_val;
        }
      }
      return nonzero_sequence;
  },

  scale: function (sequence, new_min, new_max) {
    if ( sequence.length == 1 ) {
      return [(Number(new_max) + Number(new_min)) / 2];
    }
    // first determine existing range
    let min = Math.min.apply(Math, sequence);
    let max = Math.max.apply(Math, sequence);
    // now scale each value based on new_min, new_max
    let scaled_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        scaled_sequence[key] = module.exports.scale(step, Number(new_min), Number(new_max));
      }
      else {
        let new_val = module.exports.scaleInner(step, [min,max], [Number(new_min), Number(new_max)]);
        scaled_sequence[key] = Number(new_val.toFixed(4));
      }
    }
    return scaled_sequence;
  },

  scaleInner: function ( value, r1, r2 ) {
      return ( value - r1[ 0 ] ) * ( r2[ 1 ] - r2[ 0 ] ) / ( r1[ 1 ] - r1[ 0 ] ) + r2[ 0 ];
  },

  distavg: function (sequence) {
    let dist_sequence = [];
    let average = sequence.reduce((a, b) => a + b) / sequence.length;
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        dist_sequence[key] = distavg(step);
      }
      else {
        dist_sequence[key] = Number((step - average).toFixed(4));
      }
    }
    return dist_sequence;
  },

  sticky: function (sequence, amt) {
    amt = Number(amt);
    if ( amt < 0 ) {
      amt = 0;
    }
    else if ( amt > 1 ) {
      amt = 1;
    }
    let sticky_sequence = [];
    let stuck_key;
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        sticky_sequence[key] = sticky(step, amt);
      }
      else {
        if ( Math.random() > amt ) {
          stuck_key = key;
          sticky_sequence[key] = step;
        }
        else {
          if ( sequence[stuck_key] ) {
            sticky_sequence[key] = sequence[stuck_key];
          }
          else {
            sticky_sequence[key] = step;
          }
        }
      }
    }
    return sticky_sequence;
  },

  saheach: function (sequence, num) {
    num = Math.round(Math.abs(Number(num)));
    let count = 0;
    let sah_sequence = [];
    let prev_step;
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        sah_sequence[key] = module.exports.saheach(step, num);
      }
      else {
        if ( count % num == 0 || key == 0 ) {
          sah_sequence[key] = step;
          prev_step = step;
        }
        else {
          sah_sequence[key] = prev_step;
        }
      }
      count++;
    }
    return sah_sequence;
  },

  clip: function (sequence, min, max) {
    if (!min) {
      min = 0;
    }
    if (!max) {
      max = 0;
    }
    let clipped_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        clipped_sequence[key] = module.exports.clip(step, Number(min), Number(max));
      }
      else {
        if ( step < min ) {
          clipped_sequence[key] = Number(min);
        }
        else if ( step > max ) {
          clipped_sequence[key] = Number(max);
        }
        else {
          clipped_sequence[key] = step;
        }
      }
    }
    return clipped_sequence;
  },

  saturate: function (sequence, gain) {
    if (!gain) {
      gain = 1;
    }
    gain = Number(gain);
    let saturated_sequence = [];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        saturated_sequence[key] = module.exports.saturate(step, gain);
      }
      else {
        saturated_sequence[key] = Math.tanh(step * gain).toFixed(4);;
      }
    }
    return saturated_sequence;
  },

  invert: function (sequence) {
    let inverted_sequence = [];
    let min = Math.min.apply(Math, sequence);
    let max = Math.max.apply(Math, sequence);
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        inverted_sequence[key] = module.exports.invert(step);
      }
      else {
        inverted_sequence[key] = min + (max - step);
      }
    }
    return inverted_sequence;
  },

  at: function (sequence, position, value) {
    position = module.exports.clip([Math.abs(Number(position))],0,1);
    let replace_position = Math.round(position * (sequence.length-1));
    sequence[replace_position] = value;
    return sequence;
  },

  interp: function (sequence, prob, mult_str) {
    let interp_sequence = [];
    let amt = Math.abs(Number(prob));
    let mult_sequence = module.exports.get(mult_str.trim());
    let same_size_arrays = module.exports.makeArraysTheSameSize(sequence, mult_sequence);
    sequence = same_size_arrays[0];
    mult_sequence = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        interp_sequence[key] = module.exports.interp(step, destination_prop, amt);
      }
      else {
        // linear interpolation between the two provided sequences
        let seq_amt = (1 - amt) * step;
        let mult_amt = amt * mult_sequence[key];
        let avg = (seq_amt + mult_amt);
        interp_sequence[key] = avg;
      }
    }
    return interp_sequence;
  },

  convolve: function (sequence1, sequence2) {
    sequence1 = module.exports.reduce(sequence1,8192);
    sequence2 = module.exports.reduce(sequence2,8192);
    var al = sequence1.length;
    var wl = sequence2.length;
    var offset = ~~(wl / 2);
    var output = new Array(al);
    for (var i = 0; i < al; i++) {
      var kmin = (i >= offset) ? 0 : offset - i;
      var kmax = (i + offset < al) ? wl - 1 : al - 1 - i + offset;
      output[i] = 0;
      for (var k = kmin; k <= kmax; k++)
        output[i] += sequence1[i - offset + k] * sequence2[k];
    }
    return output;
  },

  // WINDOW operations
  applyWindow: function (signal, func) {
    var i, n=signal.length, args=[0,n]

    // pass rest of args
    for(i=2; i<arguments.length; i++) {
      args[i] = arguments[i]
    }

    for(i=n-1; i>=0; i--) {
      args[0] = i
      signal[i] *= func.apply(null,args)
    }
    return signal;
  },

  fade: function (sequence) {
    return module.exports.applyWindow(sequence, module.exports.hamming);
  },

  flattop: function (sequence) {
    return module.exports.applyWindow(sequence, module.exports.flatTopInner);
  },

  hamming: function (i,N) {
    return 0.54 - 0.46 * Math.cos(6.283185307179586*i/(N-1))
  },

  flatTopInner: function (i,N) {
    var a0 = 1,
        a1 = 1.93,
        a2 = 1.29,
        a3 = 0.388,
        a4 = 0.028,
        f = 6.283185307179586*i/(N-1)

    return a0 - a1*Math.cos(f) +a2*Math.cos(2*f) - a3*Math.cos(3*f) + a4 * Math.cos(4*f)
  },
  // END WINDOW operations. shimmed from https://github.com/scijs/window-function

  // END pattern operations

  // BEGIN pattern generators. NO sequence argument
  sine: function (periods, length) {
    let sine_sequence = [];
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    for (var a = 0; a < periods; a++) {
      for (var i = 0; i < length; i++) {
        let num_scaled = (Math.PI * 2) * (i / length);
        sine_sequence[(a * length) + i] = Number(Math.sin(num_scaled).toFixed(4));
      }
    }
    // scale sine from 0 to 1 and make the first sample be 0
    return module.exports.shift(module.exports.scale(sine_sequence,0,1), ((1/periods) * 0.25));
  },

  cosine: function (periods, length) {
    // apply a 0.25 phase shift to a sine
    let cosine_sequence = [];
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    let sine_sequence = module.exports.sine(periods, length);
    return module.exports.shift(sine_sequence, ((1/periods) * -0.25));
  },

  tri: function (periods, length) {
    let tri_sequence = [];
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    // create a ramp from 0 to 1
    for (var i = 0; i <= (length - 1); i++) {
      let num_scaled = i / (length - 1);
      tri_sequence[i] = Number(num_scaled.toFixed(4));
    }
    // palindrome the ramp to create a triangle, then reduce it to the specified length
    let tri = module.exports.reduce(module.exports.palindrome(tri_sequence), length);
    // now copy that triangle for n periods
    tri_sequence = [];
    for (var a = 0; a < periods; a++) {
      for (var i = 0; i <= (length - 1); i++) {
        tri_sequence[(a * length) + i] = tri[i];
      }
    }
    return tri_sequence;
  },

  square: function (periods, length) {
    let square_sequence = [];
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    for (var a = 0; a < periods; a++) {
      for (var i = 0; i < length; i++) {
        let num_scaled = 0;
        if ( i / length > 0.5 ) {
          num_scaled = 1;
        }
        square_sequence[(a * length) + i] = Number(Math.sin(num_scaled).toFixed(4));
      }
    }
    return square_sequence;
  },

  drunk: function (length, intensity) {
    let drunk_sequence = [];
    let d = Math.random();
    for (var i = 0; i < length; i++) {
      let amount_to_add = Math.random() * Number(intensity);
      if ( Math.random() < 0.5 ) {
        amount_to_add *= -1;
      }
      d += amount_to_add;
      if ( d < 0 ) {
        d = 0;
      }
      if ( d > 1 ) {
        d = 1;
      }
      drunk_sequence[i] = d.toFixed(4);
    }
    return drunk_sequence;
  },

  turing: function (length) {
    length = Math.abs(Number(length));
    return module.exports.round(noise(length));
  },

  mult: function (varname) {
    varname = varname.trim();
    return module.exports.get(varname.trim());
  },

  get: function(varname) {
    if (!module.exports.stores[varname]) {
      throw `Could not find set pattern: ${varname}`;
    }
    return module.exports.stores[varname];
  },

  any: function () {
    // randomly select any of the prior commands in the block
    let selected_facet = module.exports.randomProperty(module.exports.facets);
    let selected_facet_value = Object.values(selected_facet);
    selected_facet_value = module.exports.shuffle(selected_facet_value);
    return selected_facet_value[0].split(' ');
  },

  randomProperty: function (obj) {
    let keys = Object.keys(obj);
    return obj[keys[ keys.length * Math.random() << 0]];
  },

  phasor: function (periods, length) {
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    return module.exports.dup(module.exports.ramp(0,1,length), periods);
  },

  noise: function (length) {
    let noise_sequence = [];
    for (var i = 0; i < length; i++) {
      noise_sequence[i] = Math.random();
    }
    return noise_sequence;
  },

  ramp: function (from, to, size) {
    let ramp_sequence = [];
    from = Number(from);
    to = Number(to);
    size = Math.abs(Number(size));
    let amount_to_add = parseFloat(Math.abs(to - from) / size);
    if ( to < from ) {
      amount_to_add *= -1;
    }
    for (var i = 0; i < size; i++) {
      ramp_sequence[i] = from;
      from += amount_to_add;
    }
    return ramp_sequence;
  },

  data: function (list) {
    // user can supply an aribtrary array of data to certain functions like am()
    return list;
  },

  brot: function (length, x, y) {
    // iterates based on the function used to generate the mandelbrot set.
    // takes a complex number (x,y). squares x, adds y... repeat.
    // the output of this function is the x value. sadly there is just as much information in y
    // but wavetables (the destination for facet's data) are 2D not 3D!
    // the best values for x are within -0.8 and 0.25
    // the best values for y are within -0.8 0.8
    length = Math.abs(Number(length));
    x = Number(x);
    y = Number(y);
    let brot_sequence = [];
    for (var i = 0; i < length; i++) {
      brot_sequence.push(x);
      x = (x*x) + y;
    }
    return module.exports.clip(brot_sequence,-1, 1);
  },

  randsamp: function(dir) {
    if (!dir) {
      dir = `../samples/`;
    }
    var files = fs.readdirSync(dir);
    let chosenFile = files[Math.floor(Math.random() * files.length)];
    let buffer, decodedAudio;
    try {
      buffer = fs.readFileSync(`${dir}${chosenFile}`);
      decodedAudio = wav.decode(buffer);
      // this is a bit hacky - ideally if it fails loading the wav file, it would try again
      // in the directory until it finds one.. or until it has tried as many files as are in the directory.
      // until i implement that, this is just 3 tries before throwing the exception
    } catch (e) {
      try {
        chosenFile = files[Math.floor(Math.random() * files.length)];
        buffer = fs.readFileSync(`${dir}${chosenFile}`);
        decodedAudio = wav.decode(buffer);
      } catch (e) {
        try {
          chosenFile = files[Math.floor(Math.random() * files.length)];
          buffer = fs.readFileSync(`${dir}${chosenFile}`);
          decodedAudio = wav.decode(buffer);
        } catch (e) {
          throw(e);
        }
      }
    } finally {
      return module.exports.reduce(Array.from(decodedAudio.channelData[0]),48000);
    }
  },

  sample: function(file_name) {
    let buffer = fs.readFileSync(`../samples/${file_name}`);
    let decodedAudio = wav.decode(buffer);
    return Array.from(decodedAudio.channelData[0]);
  },
  // END pattern generators

  // BEGIN comment-stripping library
  stripComments: function (toBeStrippedStr) {
  // forked from: https://gist.github.com/SudoPlz/037b229ea53717bbcac1
  //LEXER
    function Lexer () {
      this.setIndex = false;
      this.useNew = false;
      for (var i = 0; i < arguments.length; ++i) {
        var arg = arguments [i];
        if (arg === Lexer.USE_NEW) {
          this.useNew = true;
        }
        else if (arg === Lexer.SET_INDEX) {
          this.setIndex = Lexer.DEFAULT_INDEX;
        }
        else if (arg instanceof Lexer.SET_INDEX) {
          this.setIndex = arg.indexProp;
        }
      }
      this.rules = [];
      this.errorLexeme = null;
    }

    Lexer.NULL_LEXEME = {};

    Lexer.ERROR_LEXEME = {
      toString: function () {
        return "[object Lexer.ERROR_LEXEME]";
      }
    };

    Lexer.DEFAULT_INDEX = "index";

    Lexer.USE_NEW = {};

    Lexer.SET_INDEX = function (indexProp) {
      if ( !(this instanceof arguments.callee)) {
        return new arguments.callee.apply (this, arguments);
      }
      if (indexProp === undefined) {
        indexProp = Lexer.DEFAULT_INDEX;
      }
      this.indexProp = indexProp;
    };

    (function () {
      var New = (function () {
        var fs = [];
        return function () {
          var f = fs [arguments.length];
          if (f) {
            return f.apply (this, arguments);
          }
          var argStrs = [];
          for (var i = 0; i < arguments.length; ++i) {
            argStrs.push ("a[" + i + "]");
          }
          f = new Function ("var a=arguments;return new this(" + argStrs.join () + ");");
          if (arguments.length < 100) {
            fs [arguments.length] = f;
          }
          return f.apply (this, arguments);
        };
      }) ();

      var flagMap = [
          ["global", "g"]
        , ["ignoreCase", "i"]
        , ["multiline", "m"]
        , ["sticky", "y"]
        ];

      function getFlags (regex) {
        var flags = "";
        for (var i = 0; i < flagMap.length; ++i) {
          if (regex [flagMap [i] [0]]) {
            flags += flagMap [i] [1];
          }
        }
        return flags;
      }

      function not (x) {
        return function (y) {
          return x !== y;
        };
      }

      function Rule (regex, lexeme) {
        if (!regex.global) {
          var flags = "g" + getFlags (regex);
          regex = new RegExp (regex.source, flags);
        }
        this.regex = regex;
        this.lexeme = lexeme;
      }

      Lexer.prototype = {
          constructor: Lexer

        , addRule: function (regex, lexeme) {
            var rule = new Rule (regex, lexeme);
            this.rules.push (rule);
          }

        , setErrorLexeme: function (lexeme) {
            this.errorLexeme = lexeme;
          }

        , runLexeme: function (lexeme, exec) {
            if (typeof lexeme !== "function") {
              return lexeme;
            }
            var args = exec.concat (exec.index, exec.input);
            if (this.useNew) {
              return New.apply (lexeme, args);
            }
            return lexeme.apply (null, args);
          }

        , lex: function (str) {
            var index = 0;
            var lexemes = [];
            if (this.setIndex) {
              lexemes.push = function () {
                for (var i = 0; i < arguments.length; ++i) {
                  if (arguments [i]) {
                    arguments [i] [this.setIndex] = index;
                  }
                }
                return Array.prototype.push.apply (this, arguments);
              };
            }
            while (index < str.length) {
              var bestExec = null;
              var bestRule = null;
              for (var i = 0; i < this.rules.length; ++i) {
                var rule = this.rules [i];
                rule.regex.lastIndex = index;
                var exec = rule.regex.exec (str);
                if (exec) {
                  var doUpdate = !bestExec
                    || (exec.index < bestExec.index)
                    || (exec.index === bestExec.index && exec [0].length > bestExec [0].length)
                    ;
                  if (doUpdate) {
                    bestExec = exec;
                    bestRule = rule;
                  }
                }
              }
              if (!bestExec) {
                if (this.errorLexeme) {
                  lexemes.push (this.errorLexeme);
                  return lexemes.filter (not (Lexer.NULL_LEXEME));
                }
                ++index;
              }
              else {
                if (this.errorLexeme && index !== bestExec.index) {
                  lexemes.push (this.errorLexeme);
                }
                var lexeme = this.runLexeme (bestRule.lexeme, bestExec);
                lexemes.push (lexeme);
                index = bestRule.regex.lastIndex;
              }
            }
            return lexemes.filter (not (Lexer.NULL_LEXEME));
          }
      };
    }) ();

    if (!Array.prototype.filter) {
      Array.prototype.filter = function (fun) {
        var len = this.length >>> 0;
        var res = [];
        var thisp = arguments [1];
        for (var i = 0; i < len; ++i) {
          if (i in this) {
            var val = this [i];
            if (fun.call (thisp, val, i, this)) {
              res.push (val);
            }
          }
        }
        return res;
      };
    }

    Array.prototype.last = function () {
      return this [this.length - 1];
    };

    RegExp.prototype.getFlags = (function () {
      var flagMap = [
          ["global", "g"]
        , ["ignoreCase", "i"]
        , ["multiline", "m"]
        , ["sticky", "y"]
        ];

      return  function () {
        var flags = "";
        for (var i = 0; i < flagMap.length; ++i) {
          if (this [flagMap [i] [0]]) {
            flags += flagMap [i] [1];
          }
        }
        return flags;
      };
    }) ();

    RegExp.concat = function (/*r1, r2, ..., rN [, flagMerger] */) {
      var regexes = Array.prototype.slice.call (arguments);
      var regexStr = "";
      var flags = (regexes [0].getFlags && regexes [0].getFlags ()) || "";
      var flagMerger = RegExp.concat.INTERSECT_FLAGS;
      if (typeof regexes.last () === "function") {
        flagMerger = regexes.pop ();
      }
      for (var j = 0; j < regexes.length; ++j) {
        var regex = regexes [j];
        if (typeof regex === "string") {
          flags = flagMerger (flags, "");
          regexStr += regex;
        }
        else {
          flags = flagMerger (flags, regex.getFlags ());
          regexStr += regex.source;
        }
      }
      return new RegExp (regexStr, flags);
    };

    (function () {
      function setToString (set) {
        var str = "";
        for (var prop in set) {
          if (set.hasOwnProperty (prop) && set [prop]) {
            str += prop;
          }
        }
        return str;
      }

      function toSet (str) {
        var set = {};
        for (var i = 0; i < str.length; ++i) {
          set [str.charAt (i)] = true;
        }
        return set;
      }

      function union (set1, set2) {
        for (var prop in set2) {
          if (set2.hasOwnProperty (prop)) {
            set1 [prop] = true;
          }
        }
        return set1;
      }

      function intersect (set1, set2) {
        for (var prop in set2) {
          if (set2.hasOwnProperty (prop) && !set2 [prop]) {
            delete set1 [prop];
          }
        }
        return set1;
      }

      RegExp.concat.UNION_FLAGS = function (flags1, flags2) {
        return setToString (union (toSet (flags1), toSet (flags2)));
      }

      RegExp.concat.INTERSECT_FLAGS = function (flags1, flags2) {
        return setToString (intersect (toSet (flags1), toSet (flags2)));
      };

    }) ();

    RegExp.prototype.group = function () {
      return RegExp.concat ("(?:", this, ")", RegExp.concat.UNION_FLAGS);
    };

    RegExp.prototype.optional = function () {
      return RegExp.concat (this.group (), "?", RegExp.concat.UNION_FLAGS);
    };

    RegExp.prototype.or = function (regex) {
      return RegExp.concat (this, "|", regex, RegExp.concat.UNION_FLAGS).group ();
    };

    RegExp.prototype.many = function () {
      return RegExp.concat (this.group (), "*", RegExp.concat.UNION_FLAGS);
    };

    RegExp.prototype.many1 = function () {
      return RegExp.concat (this.group (), "+", RegExp.concat.UNION_FLAGS);
    };

    function id (x) {
      return x;
    }

    /*************************************************************************************/

    var eof = /(?![\S\s])/m;
    var newline = /\r?\n/m;
    var spaces = /[\t ]*/m;
    var leadingSpaces = RegExp.concat (/^/m, spaces);
    var trailingSpaces = RegExp.concat (spaces, /$/m);

    var lineComment = /\/\/(?!@).*/m;
    var blockComment = /\/\*(?!@)(?:[^*]|\*[^/])*\*\//m;
    var comment = lineComment .or (blockComment);
    var comments = RegExp.concat (comment, RegExp.concat (spaces, comment).many ());
    var eofComments = RegExp.concat (leadingSpaces, comments, trailingSpaces, eof);
    var entireLineComments = RegExp.concat (leadingSpaces, comments, trailingSpaces, newline);

    var lineCondComp = /\/\/@.*/;
    var blockCondComp = /\/\*@(?:[^*]|\*[^@]|\*@[^/])*@*\*\//;

    var doubleQuotedString = /"(?:[^\\"]|\\.)*"/;
    var singleQuotedString = /'(?:[^\\']|\\.)*'/;

    var regexLiteral = /\/(?![/*])(?:[^/\\[]|\\.|\[(?:[^\]\\]|\\.)*\])*\//;

    var anyChar = /[\S\s]/;

    /*************************************************************************************/


    var stripper = new Lexer ();

    stripper.addRule (entireLineComments, Lexer.NULL_LEXEME);

    stripper.addRule (
        RegExp.concat (newline, entireLineComments.many (), eofComments)
      , Lexer.NULL_LEXEME
    );

    stripper.addRule (
        RegExp.concat (comment, RegExp.concat (trailingSpaces, newline, eofComments).optional ())
      , Lexer.NULL_LEXEME
    );

    stripper.addRule (lineCondComp, id);
    stripper.addRule (blockCondComp, id);

    stripper.addRule (doubleQuotedString, id);
    stripper.addRule (singleQuotedString, id);

    stripper.addRule (regexLiteral, id);

    stripper.addRule (anyChar, id);

    /*************************************************************************************/

    return stripper.lex(toBeStrippedStr).join ("");
  }
  // END comment-stripping library

};
