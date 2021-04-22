// begin code parsing testing

function replaceAll(string, search, replace) {
  return string.split(search).join(replace);
}

function getDatum(value) {
  let datum, eval_datum;
  if ( value.indexOf("].") == -1 ) {
    datum = value.substring(
        value.indexOf("[") ,
        value.lastIndexOf("]") + 1
    );
  }
  else {
    datum = value.substring(
        value.indexOf("[") ,
        value.indexOf("].") + 1
    );
  }
  datum = datum.trim();
  datum = replaceAll(datum, ' ', ',');
  datum = replaceAll(datum, ',,', ',');
  datum = replaceAll(datum, ' ]', ']');
  datum = replaceAll(datum, ' [', '[');
  try {
    // first try parsing the input string as JSON.
    // hard-coded syntax e.g. [0 1 [0 2 4] 1]
    datum = JSON.parse(datum);
    return datum;
  } catch (e) {
    // if that fails, try removing the array braces and eval-ing the code
    // (in case it contains other function calls)
    try {
      datum = datum.substring(1, datum.length - 1);
      datum = eval(datum);
      return datum;
    } catch (er) {
      throw `Could not parse datum: ${datum}`;
    }
  }
}

function removeTabsAndNewlines(user_input) {
  // remove tabs, newlines, and multiple spaces
  return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
}

function getDestination(code) {
  // TODO check for valid destinations
  return code.split(' ')[1];
}

function getProperty(code) {
  // TODO check for valid properties
  return code.split(' ')[0];
}

function getStatement(code, property) {
  return code.split(property)[1];
}

function parseStringOfOperations(value) {
  // everything after the period following the datum.
  // basically all the operations in string form. if no operations, returns empty string
  return value.substring(
      value.indexOf("].") + 2,
      value.length
  );
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
    if ( !args.includes('(') && !args.includes('(') ) {
      operations.push({
        'op': op,
        'args': args
      });
    }
    else {
      try {
        args = eval(args);
        operations.push({
          'op': op,
          'args': args.toFixed(4)
        });
      } catch (er) {
        throw `Could not parse argument: ${args}`;
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

      let args_split = op.args.replace(' ', '').split(',');
      for (var i = 0; i < args_split.length; i++) {
        args.push(args_split[i]);
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

function facetInit() {
  return {
    k1: {},
    k2: {},
    s1: {},
    s2: {},
    h1: {},
    h2: {},
    a1: {},
    a2: {},
    comb: {},
    verb: {},
    global: {}
  };
}

let facets = facetInit();

function facetParse(user_input) {
  let commands = [], destination, property, statement, datum, ops_string,
  operations = [], max_sub_steps, flat_sequence, sequence_msg;
  // parse user input into individual operations on data.
  // run those operations, scale and flatten the resulting array,
  // and send that data into Max so it can go in a buffer wavetable
  user_input = removeTabsAndNewlines(user_input);
  // TODO: here, parse the "every" text if it exists.
  commands = getCommands(user_input);
  Object.values(commands).forEach(command => {
    destination = getDestination(command);
    property = getProperty(command);
    statement = getStatement(command, destination);
    datum = getDatum(statement);
    ops_string = parseStringOfOperations(statement);
    operations = parseOperations(ops_string);
    datum = runOperations(operations, datum);
    max_sub_steps = getMaximumSubSteps(datum) - 1;
    flat_sequence = flattenSequence(datum, max_sub_steps);
    sequence_msg = convertFlatSequenceToMessage(flat_sequence);
    facets[property][destination] = sequence_msg;
  });
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
function rand(min, max, int_mode = 0) {
  // returns number within range
  let num = Math.random() * (Number(max) - Number(min) + 1) + Number(min);
  if ( int_mode != 0 ) {
    num = Math.trunc(num);
  }
  return num;
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

function palindrome(sequence) {
  return sequence.concat(rev(sequence));
}

function dup(sequence, num) {
  return Array.from({length: num}).flatMap(a => sequence);
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
  let reduced_sequence = [];
  if ( new_size > sequence.length ) {
    return sequence;
  }
  let modulo = Math.ceil(sequence.length / new_size);
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

function move(sequence, direction) {
  let moved_sequence = [];
  // moving left require the keys to become bigger, but the argument makes more sense
  // when moving left is negative, hence the * - 1 here.
  direction *= -1;
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      moved_sequence[key] = move(step, direction);
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

// END pattern operations

// BEGIN pattern generators. NO sequence argument
function sine(length) {
  let sine_sequence = [];
  for (var i = 0; i < length; i++) {
    let num_scaled = (Math.PI * 2) * (i / length);
    sine_sequence[i] = Number(Math.sin(num_scaled).toFixed(4));
  }
  return sine_sequence;
}

function tri(length) {
  let tri_sequence = [];
  for (var i = 0; i <= (Number(length) - 1); i++) {
    let num_scaled = i / (Number(length) - 1);
    tri_sequence[i] = Number(num_scaled.toFixed(4));
  }
  return reduce(palindrome(tri_sequence), length);
}

function square(length) {
  let square_sequence = [];
  for (var i = 0; i <= (Number(length) - 1); i++) {
    let num_scaled = i % 2;
    square_sequence[i] = Number(num_scaled.toFixed(4));
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
      d = 1 + d;
    }
    if ( d > 1 ) {
      d = d - 1;
    }
    drunk_sequence[i] = d;
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

// END pattern generators

/*
TODO:
1. receiving user input, parsing that into the array data structure. this also requires building functions for concatenation, reverse, etc
2. array modifiers, both destructive and non-destructive
3. sending data into max
4. time modifiers, where at the beginning of every sequence it can run "every / sometimes" type stuff
5. waveform files that can be loaded into the array. also lfnoise, probability mods, etc

*/
