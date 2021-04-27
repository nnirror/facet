// begin code parsing testing

function replaceAll(string, search, replace) {
  return string.split(search).join(replace);
}

function getDatum(value) {
  let datum_regex = /\[.*][\.;]/;
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
  if ( codeIsFunction(datum) ) {
    datum = eval(datum);
  }
  else {
    datum = datum.trim();
    datum = replaceAll(datum, ' ]', ']');
    datum = replaceAll(datum, ' ', ',');
    datum = replaceAll(datum, ' [', '[');
    datum = replaceAll(datum, ',,', ',');
    datum = JSON.parse(datum);
  }
  return datum;
}

function codeIsFunction(code) {
  let function_regex = /.*\(.*\)]/;
  if ( code.match(function_regex) ) {
    return true;
  }
  return false;
}

function removeTabsAndNewlines(user_input) {
  // remove tabs, newlines, and multiple spaces
  user_input = user_input.replace(/\s\s+/g, '');
  return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
}

function getDestination(code) {
  // TODO check for valid destinations
  return code.split(' ')[0];
}

function getProperty(code) {
  // TODO check for valid properties
  return code.split(' ')[1];
}

function getStatement(code, property) {
  let statement_regex = /\[.*]*/;
  return code.match(statement_regex)[0];
}

function parseStringOfOperations(value) {
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
}

function splitArguments(str) {
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
}

function parseOperations(value) {
  let operations = [];
  let split_ops = splitArguments(value);

  // get ops_string
  // translate ops string into an object. split on period, loop through
  for (const [k, d] of Object.entries(split_ops)) {
    let op = d.split('(')[0];
    let args = d.substring(
        // everything after the period following the datum. basically all the operations
        // in string form
        d.indexOf("(") + 1,
        d.lastIndexOf(")"),
    );
    if ( !args.includes('(') && !args.includes(')') ) {
      // simple, hard-coded argument - no need to eval any code or parse anything
      operations.push({
        'op': op,
        'args': args
      });
    }
    else {
      try {
        // attempt to eval the code. this should work if the argument
        // is a single, non-chained operation, e.g. shift(random(0,random(0,1,0),0))
        args = eval(args);
        // flatten the eval'ed args back into the "args" structure
        if ( typeof args == 'number' ) {
          args = `[${args.toString()}]`;
        }
        else {
          args = JSON.stringify(args);
        }
        operations.push({
          'op': op,
          'args': args
        });
      } catch (er) {
        try {
          // attempt to recursively parse the args, as if it were its own datum
          // and series of operations. insert a '[' at the beginning, and a ']'
          // after the first instance of ').' basically creates the structure needed to
          // parse: [generator(2,3,3.5)].foo(1,2);
          args = args.replace(').', ')].');
          args = '[' + args;
          let datum_from_args = getDatum(args);
          let processed_code_fom_args = processCode(args, datum_from_args);
          if ( typeof processed_code_fom_args == 'number' ) {
            processed_code_fom_args = `[${c.toString()}]`;
          }
          else {
            // bug: sequence[0] again
            for (var i = 0; i < processed_code_fom_args[0].length; i++) {
              processed_code_fom_args[0][i] = processed_code_fom_args[0][i].toFixed(4);
            }
            processed_code_fom_args = JSON.stringify(processed_code_fom_args[0]);
          }
          operations.push({
            'op': op,
            'args': processed_code_fom_args
          });
        } catch (e) {
          throw `Could not parse argument: ${args}`;
        }
      }
    }
  }
  return operations;
}

function runOperations(operations, datum) {
  for (const [key, op] of Object.entries(operations)) {
    var fn = window[op.op];
    if ( typeof fn === 'function' ) {
      let args = [];
      args.push(datum);
      try {
        args.push(JSON.parse(op.args));
      } catch (e) {
        let args_split = op.args.replaceAll(' ', '').split(',');
        for (var i = 0; i < args_split.length; i++) {
          args.push(args_split[i]);
        }
      }
      datum = fn.apply(null, args);
    }
  }
  // if the array exceeds 1024 values, re-scale it to 1024.
  return reduce(datum, 1024);
}

function getCommands(user_input) {
  return user_input.trim().split(';').filter(Boolean);
}

function createMultConnections(operations, destination, property) {
  let m = {};
  for (const [key, op] of Object.entries(operations)) {
    if ( op.op == 'mult' ) {
      let args = op.args;
      args = args.replaceAll('\'', '').replaceAll('"', '');
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
}

function handleMultConnections(facets, mults) {
  for (const [key, mult] of Object.entries(mults)) {
    if ( !facets[mult.to_destination] ) {
      facets[mult.to_destination] = {};
    }
    facets[mult.to_destination][mult.to_property] = facets[mult.from_destination][mult.from_property];
  }
  return facets;
}

function initFacetDestination(facets, destination) {
  if ( !facets[destination] ) {
    facets[destination] = {};
  }
  return facets;
}

function facetInit() {
  return {};
}

let facets = facetInit();

function processCode(statement, datum) {
  let ops_string, operations = [];
  ops_string = parseStringOfOperations(statement);
  operations = parseOperations(ops_string);
  datum = runOperations(operations, datum);
  return datum;
}

function facetParse(user_input) {
  let commands = [], destination, property, statement, datum, ops_string,
  operations = [], max_sub_steps, flat_sequence, sequence_msg, mults = {};
  // parse user input into individual operations on data.
  // run those operations, scale and flatten the resulting array,
  // and send that data into Max so it can go in a buffer wavetable
  try {
    user_input = removeTabsAndNewlines(user_input);
    commands = getCommands(user_input);
    Object.values(commands).forEach(command => {
      destination = getDestination(command);
      property = getProperty(command);
      statement = getStatement(command, property);
      datum = getDatum(statement);
      datum = processCode(statement, datum);
      max_sub_steps = getMaximumSubSteps(datum) - 1;
      flat_sequence = flattenSequence(datum, max_sub_steps);
      initFacetDestination(facets, destination);
      facets[destination][property] = convertFlatSequenceToMessage(flat_sequence);
      facets = handleMultConnections(facets, mults);
    });
  } catch (e) {
    $.notify(e, {
      allow_dismiss: true,
      delay: 2000,
      newest_on_top: true
    });
  }
  return facets;
}

function convertFlatSequenceToMessage(flat_sequence) {
  let out = '';
  for (var i = 1; i <= flat_sequence.length; i++) {
    out += flat_sequence[i-1];
    if ( i != flat_sequence.length ) {
       out += ' ';
    }
  }
  return out;
}

function flattenSequence(sequence, max_sub_steps) {
  // converts a basic "sequence array" into an isomorphism that can go in a wavetable buffer.
  // if the "sequence array" was [0, 1, [2,4], [1,2,3,4]], the wavetable buffer would be:
  // [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 4, 4, 1, 2, 3, 4]
  let out = [];
  Object.values(sequence).forEach(step => {
    if ( Array.isArray(step) ) {
      let s = flattenSequence(step, max_sub_steps-1);
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
}

// returns the maximum number of sub-steps in a given pattern.
// needed to calculate the resolution of a given row sequence when converting from
// multi-dimensional array to wavetable buffer
function getMaximumSubSteps(sequence) {
  return Array.isArray(sequence) ?
    1 + Math.max(...sequence.map(getMaximumSubSteps)) :
    0;
}
// BEGIN  all modulators

// BEGIN single-number operations
// sequence is not needed as an argument for these in the actual code since it's added implicitly
// in the runOperations functions
function random(min, max, int_mode = 0) {
  // returns number within range
  let num = Math.random() * (Number(max) - Number(min) + 1) + Number(min);
  if ( int_mode != 0 ) {
    num = Math.trunc(num);
  }
  return num;
}

function mult(sequence) {
  // there is  additional logic for actually multing the resulting flattened array
  // for a given destination / property. when mult() comes up in the code, simply
  // return the pattern as-is for now.
  return sequence;
}

function choose(list) {
  let shuffled = shuffle(list);
  return shuffled[0];
}

function data(list) {
  // user can supply an aribtrary array of data to certain functions like am()
  return list;
}
// END single-number operations

// BEGIN pattern operations
// sequence is always first argument, any additional arguments are after
function rev(sequence) {
  let reversed_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      reversed_sequence[((sequence.length - 1) - key)] = rev(step);
    }
    else {
      reversed_sequence[((sequence.length - 1) - key)] = step;
    }
  }
  return reversed_sequence;
}

function append(sequence1, sequence2) {
  return sequence1.concat(sequence2);
}

function truncate(sequence, length) {
  return sequence.slice(0, Number(length));
}

function palindrome(sequence) {
  return sequence.concat(rev(sequence));
}

function dup(sequence, num) {
  return Array.from({length: num}).flatMap(a => sequence);
}

function smooth(sequence) {
  let smoothed_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    let k = Number(key);
    if ( Array.isArray(step) ) {
      smoothed_sequence[k] = smooth(step);
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
}


function am(sequence1, sequence2) {
  // BUG: i don't know why i have to set this to sequence1[0] when using functions instead of hard-coded array sructures
  if ( Array.isArray(sequence1[0]) )  {
    sequence1 = sequence1[0];
  }

  if ( sequence1.length > sequence2.length ) {
    sequence2 = scaleTheArray(sequence2, parseInt(sequence1.length / sequence2.length));
  }
  else if ( sequence2.length > sequence1.length ) {
    sequence2 = reduce(sequence2, sequence1.length);
  }
  // now both arrays have the same number of keys, multiply seq1 key by same seq2
  // TODO now what about inner arrays. probably multiply every value?
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = am(step, sequence2);
    }
    else {
      if ( isNaN(sequence2[key]) ) {
        sequence1[key] = 0;
      }
      else {
        sequence1[key] = step * sequence2[key];
      }
    }
  }
  return sequence1;
}

function scaleTheArray(arrayToScale, nTimes) {
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
}

function quantize(sequence, resolution) {
  resolution = parseInt(Number(resolution));
  let quantized_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      quantized_sequence[key] = quantize(step, resolution);
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
}

function interlace(sequence1, sequence2) {
     let interlaced_sequence = [];
    // BUG: i don't know why i have to set this to sequence1[0] when using functions instead of hard-coded array sructures
    if ( Array.isArray(sequence1[0]) )  {
      sequence1 = sequence1[0];
    }

    if ( sequence1.length > sequence2.length ) {
      sequence2 = scaleTheArray(sequence2, parseInt(sequence1.length / sequence2.length));
    }
    else if ( sequence2.length > sequence1.length ) {
      sequence2 = reduce(sequence2, sequence1.length);
    }
    for (const [key, step] of Object.entries(sequence1)) {
      interlaced_sequence.push(sequence1[key]);
      if ( isNaN(sequence2[key]) ) {
        interlaced_sequence.push(0)
      }
      else {
        interlaced_sequence.push(sequence2[key]);
      }
    }
    return interlaced_sequence;
}

function jam(sequence, prob, amt) {
  // change some of the values
  let jammed_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      jammed_sequence[key] = jam(step, prob, amt);
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
          jammed_sequence[key] = Number((step + step_distance).toFixed(4));
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
}

function walk(sequence, prob, amt) {
  // swap some of the locations
  let jammed_sequence = [];
  let x_max = sequence.length - 1;
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      jammed_sequence[key] = walk(step, prob, amt);
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
}

function recurse(sequence, prob) {
  let recursive_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      recursive_sequence[key] = recurse(step, prob);
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
}

function prob(sequence, amt) {
  amt = Number(amt);
  let prob_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      prob_sequence[key] = prob(step, amt);
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
}

function offset(sequence, amt) {
  let offset_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      offset_sequence[key] = offset(step, amt);
    }
    else {
      offset_sequence[key] = Number(step) + Number(amt);
    }
  }
  return offset_sequence;
}

function pong(sequence, min, max) {
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
      pong_sequence[key] = pong(step, min, max);
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
}

function fracture(sequence, max_chunk_size) {
  let fracture_sequence = [];
  max_chunk_size = Number(max_chunk_size);
  let new_positions = [];
  let next_chunk = [];
  let i = 0;
  while (i < sequence.length) {
    let chunk_size = Math.ceil(Math.random() * max_chunk_size);
    let temparray = sequence.slice(i, i + chunk_size);
    i += chunk_size;
    fracture_sequence.push(temparray);
  }
  fracture_sequence = shuffle(fracture_sequence).flat();
  return fracture_sequence;
}

function map(sequence, new_values) {
  // parses ANY number of arguments into an array by removing the "sequence"
  // from the set of all arguments when the function runs
  let mapped_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      mapped_sequence[key] = map(step, new_values);
    }
    else {
      mapped_sequence[key] = new_values.reduce((a, b) => {
        return Math.abs(b - step) < Math.abs(a - step) ? b : a;
      });
    }
  }
  return mapped_sequence;
}

function unique(sequence) {
   return Array.from(new Set(sequence));
}

function abs(sequence) {
  let abs_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      abs_sequence[key] = abs(step, amt);
    }
    else {
      abs_sequence[key] = Math.abs(step);
    }
  }
  return abs_sequence;
}

function gt(sequence, amt) {
  let gt_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      gt_sequence[key] = gt(step, amt);
    }
    else {
      gt_sequence[key] = (Number(step) > Number(amt)) ? 1 : 0;
    }
  }
  return gt_sequence;
}

function gte(sequence, amt) {
  let gte_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      gte_sequence[key] = gte(step, amt);
    }
    else {
      gte_sequence[key] = (Number(step) >= Number(amt)) ? 1 : 0;
    }
  }
  return gte_sequence;
}

function lt(sequence, amt) {
  let lt_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      lt_sequence[key] = lt(step, amt);
    }
    else {
      lt_sequence[key] = (Number(step) < Number(amt)) ? 1 : 0;
    }
  }
  return lt_sequence;
}

function lte(sequence, amt) {
  let lte_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      lte_sequence[key] = lte(step, amt);
    }
    else {
      lte_sequence[key] = (Number(step) <= Number(amt)) ? 1 : 0;
    }
  }
  return lte_sequence;
}

function modulo(sequence, amt) {
  let modulo_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      modulo_sequence[key] = modulo(step, amt);
    }
    else {
      modulo_sequence[key] = Number(step) % Number(amt);
    }
  }
  return modulo_sequence;
}

function gain(sequence, amt) {
  let gain_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      gain_sequence[key] = gain(step, amt);
    }
    else {
      gain_sequence[key] = Number(step) * Number(amt);
    }
  }
  return gain_sequence;
}

function reduce(sequence, new_size) {
  new_size = Number(new_size);
  let reduced_sequence = [];
  if ( new_size > sequence.length ) {
    return sequence;
  }
  let modulo = Math.round(sequence.length / new_size);
  for (const [key, step] of Object.entries(sequence)) {
    // not recursive - only runs at global level so that the new size
    //  actually is what is entered
    // when % new_size = 0
    if ( key % modulo == 0 ) {
      reduced_sequence.push(step);
    }
  }
  return reduced_sequence;
}

function shuffle(sequence) {
  let shuffle_sequence = sequence;
  for (let i = shuffle_sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffle_sequence[i], shuffle_sequence[j]] = [shuffle_sequence[j], shuffle_sequence[i]];
  }
  for (const [key, step] of Object.entries(shuffle_sequence)) {
    if ( Array.isArray(step) ) {
      shuffle_sequence[key] = shuffle(step);
    }
  }
  return shuffle_sequence;
}

function round(sequence) {
  let rounded_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      rounded_sequence[key] = round(step);
    }
    else {
      rounded_sequence[key] = Math.round(step);
    }
  }
  return rounded_sequence;
}

function sort(sequence) {
  let sorted_sequence = [];

  sorted_sequence = sequence.sort(function(a, b) {
    return a - b;
  });
  for (const [key, step] of Object.entries(sorted_sequence)) {
    if ( Array.isArray(step) ) {
      sorted_sequence[key] = sort(step);
    }
  }
  return sorted_sequence;
}

function warp(sequence, exp) {
  // BUG: why sequence[0]
  let warped_sequence = [];
  let original_sequence = sequence[0];
  let number_of_steps = original_sequence.length;
  exp = Number(exp);
  let maximum = Math.pow(original_sequence.length, exp);
  for (var i = 0; i < number_of_steps; i++) {
    // calculate the key for this step based on the sequence length raised to an exponential power
    let warped_key = parseInt(Math.pow(Number(i), exp));
    let warped_relative_pos = (warped_key / maximum).toFixed(4);
    let original_seqence_pos = parseInt(warped_relative_pos * number_of_steps);
    warped_sequence[i] = original_sequence[original_seqence_pos];
  }
  return warped_sequence;
}

function shift(sequence, amt) {
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
      moved_sequence[key] = shift(step, direction);
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
}

function scale(sequence, new_min, new_max) {
  // first determine existing range
  let min = Math.min.apply(Math, sequence);
  let max = Math.max.apply(Math, sequence);
  // now scale each value based on new_min, new_max
  let scaled_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      scaled_sequence[key] = scale(step, Number(new_min), Number(new_max));
    }
    else {
      let new_val = scaleInner(step, [min,max], [Number(new_min), Number(new_max)]);
      scaled_sequence[key] = Number(new_val.toFixed(4));
    }
  }
  return scaled_sequence;
}

function scaleInner( value, r1, r2 ) {
    return ( value - r1[ 0 ] ) * ( r2[ 1 ] - r2[ 0 ] ) / ( r1[ 1 ] - r1[ 0 ] ) + r2[ 0 ];
}

function distavg(sequence) {
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
}

function sticky(sequence, amt) {
  let sticky_sequence = [];
  let stuck_key;
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      sticky_sequence[key] = sticky(step, amt);
    }
    else {
      if ( Math.random() > Number(amt) ) {
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
}

function clip(sequence, min, max) {
  let clipped_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      clipped_sequence[key] = clip(step, Number(min), Number(max));
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
}

function saturate(sequence, gain) {
  gain = Number(gain);
  let saturated_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      saturated_sequence[key] = saturate(step, gain);
    }
    else {
      saturated_sequence[key] = Math.tanh(step * gain);
    }
  }
  return saturated_sequence;
}

function invert(sequence) {
  let inverted_sequence = [];
  let min = Math.min.apply(Math, sequence);
  let max = Math.max.apply(Math, sequence);
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      inverted_sequence[key] = invert(step);
    }
    else {
      inverted_sequence[key] = min + (max - step);
    }
  }
  return inverted_sequence;
}

// WINDOW operations
function applyWindow(signal, func) {
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
}

function fade(sequence) {
  return applyWindow(sequence, hamming);
}

function flattop(sequence) {
  return applyWindow(sequence, flatTopInner);
}

function hamming (i,N) {
  return 0.54 - 0.46 * Math.cos(6.283185307179586*i/(N-1))
}

function flatTopInner (i,N) {
  var a0 = 1,
      a1 = 1.93,
      a2 = 1.29,
      a3 = 0.388,
      a4 = 0.028,
      f = 6.283185307179586*i/(N-1)

  return a0 - a1*Math.cos(f) +a2*Math.cos(2*f) - a3*Math.cos(3*f) + a4 * Math.cos(4*f)
}
// END WINDOW operations. shimmed from https://github.com/scijs/window-function

// END pattern operations

// BEGIN pattern generators. NO sequence argument
function sine(periods, length) {
  let sine_sequence = [];
  periods = Number(periods);
  length = Number(length);
  for (var a = 0; a < periods; a++) {
    for (var i = 0; i < length; i++) {
      let num_scaled = (Math.PI * 2) * (i / length);
      sine_sequence[(a * length) + i] = Number(Math.sin(num_scaled).toFixed(4));
    }
  }
  return sine_sequence;
}

function cosine(periods, length) {
  // apply a 0.25 phase shift to a sine
  let cosine_sequence = [];
  periods = Number(periods);
  length = Number(length);
  let sine_sequence = sine(periods, length);
  return invert(shift(sine_sequence, 0.25));
}

function tri(periods, length) {
  let tri_sequence = [];
  periods = Number(periods);
  length = Number(length);
  // create a ramp from 0 to 1
  for (var i = 0; i <= (length - 1); i++) {
    let num_scaled = i / (length - 1);
    tri_sequence[i] = Number(num_scaled.toFixed(4));
  }
  // palindrome the ramp to create a triangle, then reduce it to the specified length
  let tri = reduce(palindrome(tri_sequence), length);
  // now copy that triangle for n periods
  tri_sequence = [];
  for (var a = 0; a < periods; a++) {
    for (var i = 0; i <= (length - 1); i++) {
      tri_sequence[(a * length) + i] = tri[i];
    }
  }
  return tri_sequence;
}

function square(periods, length) {
  let square_sequence = [];
  periods = Number(periods);
  length = Number(length);
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
}

function drunk(length, intensity) {
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
}

function noise(length) {
  let noise_sequence = [];
  for (var i = 0; i < length; i++) {
    noise_sequence[i] = Math.random();
  }
  return noise_sequence;
}

function ramp(from, to, size) {
  let ramp_sequence = [];
  from = Number(from);
  to = Number(to);
  let amount_to_add = (Math.abs(to - from) / size);
  if ( to < from ) {
    amount_to_add *= -1;
  }
  for (var i = 0; i < size; i++) {
    ramp_sequence[i] = from;
    from += amount_to_add;
  }
  return ramp_sequence;
}

// END pattern generators
