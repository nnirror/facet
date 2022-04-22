const fs = require('fs');
const wav = require('node-wav');
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

          // this whole parser needs to be refactored. this is working in most situations but is terrible code.
          // it's not worth continuing to spaghetiffy; this will do for now.
          let args_str2 = '', args_str = '';
          for (var i = 0; i < args_array.length; i++) {
            args_str2 += args_array[i] + ',';
          }
          args_str2 = args_str2.slice(0,-1);
          args_str2 = args_str2.replace(/,,/g, ',');

          // however many arguments are now split into an array.
          if (op == 'sometimes' || op == 'iter' || op == 'slices' ) {
            operations.push({
              'op': op,
              'args': args_str2
            });
          }
          else {
            // loop through them, eval them, and create a csv string of the evaled arguments
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
          }
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
            try {
              operations.push({
                'op': op,
                'args': ''
              });
            } catch (ee) {
              // "Please everybody, if we haven't done what we could have done, we've tried"
              throw `Could not parse argument: ${args}`;
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
          let args_split = op.args.split(/,(?![^\(\[]*[\]\)])/);
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
    let rerun_regex = /rerun\((.*?)\)/;
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

  markov: function(sequence_name, prob, amt) {
    amt = Number(amt);
    prob = Number(prob);
    let markov_sequence = module.exports.get(sequence_name);
    markov_sequence = module.exports.jam(markov_sequence, prob, amt);
    module.exports.set(markov_sequence, sequence_name);
    return markov_sequence;
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

  slices: function(sequence, num_slices, prob, command) {
    if ( prob.includes('random(') || prob.includes('choose(') ) {
      prob = Number(eval(`module.exports.${prob}`));
    }
    if ( num_slices.includes('random(') || num_slices.includes('choose(') ) {
      num_slices = Number(eval(`module.exports.${num_slices}`));
    }
    prob = Math.abs(Number(eval(prob)));
    num_slices = Math.abs(Math.round(Number(eval(num_slices))));
    command = command.trim().replace(/\'/g, '').replace(/"/g, '');
    operations = module.exports.parseOperations(command);
    let foreach_sequence = [];
    if ( num_slices == 0 ) {
      return sequence;
    }
    else if ( num_slices > 32 ) {
      num_slices = 32;
    }
    let calc_slice_size = Math.round(sequence.length / num_slices);
    let slice_start_pos, slice_end_pos;
    let current_slice;
    for (var i = 0; i < num_slices; i++) {

      slice_start_pos = i * calc_slice_size;
      slice_end_pos = slice_start_pos + calc_slice_size;
      current_slice = module.exports.range(sequence, slice_start_pos/sequence.length, slice_end_pos/sequence.length);
      if ( Math.random() < prob ) {
        current_slice = module.exports.runOperations(operations, current_slice);
      }
      foreach_sequence.push(current_slice);
    }
    return module.exports.flattenSequence(foreach_sequence,0);
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

    var regexLal = /\/(?![/*])(?:[^/\\[]|\\.|\[(?:[^\]\\]|\\.)*\])*\//;

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

    stripper.addRule (regexLal, id);

    stripper.addRule (anyChar, id);

    /*************************************************************************************/

    return stripper.lex(toBeStrippedStr).join ("");
  }
  // END comment-stripping library

};
