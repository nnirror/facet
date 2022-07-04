"use strict";
const fs = require('fs');
const wav = require('node-wav');
const WaveFile = require('wavefile').WaveFile;
const curve_calc = require('./lib/curve_calc.js');
const FFT = require('./lib/fft.js');
const http = require('http');

class FacetPattern {
  constructor (name) {
    this.name = name ? name : Math.random();
    this.cc_data = [];
    this.data = [];
    this.history = '';
    this.hooks = [];
    this.looped = false;
    this.notes = [];
    this.pitchbend_data = [];
    this.sequence_data = [];
    this.skipped = false;
    this.store = [];
    this.stored_patterns = this.getPatterns();
    this.utils = this.getUtils();
    this.loop_has_occurred = false;
  }

  // BEGIN generator operations
  cosine (periods, length) {
    let cosine_sequence = [];
    periods = Math.round(Math.abs(Number(periods)));
    if ( periods < 1 ) {
      periods = 1;
    }
    length =Math.round(Math.abs(Number(length)));
    // apply a 0.25 phase shift to a sine
    this.sine(periods, length);
    this.shift(((1/periods) * 0.25));
    return this;
  }

  from (list) {
    if ( typeof list == 'number' ) {
      list = [list];
    }
    this.data = list;
    return this;
  }

  drunk (length, intensity = 0.1 ) {
    let drunk_sequence = [];
    let d = Math.random();
    length = Math.abs(Number(length));
    if (length < 1 ) {
      length = 1;
    }
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
      drunk_sequence[i] = d;
    }
    this.data = drunk_sequence;
    return this;
  }

  noise (length) {
    let noise_sequence = [];
    length = Math.abs(Number(length));
    if (length < 1 ) {
      length = 1;
    }
    for (var i = 0; i < length; i++) {
      noise_sequence[i] = Math.random();
    }
    this.data = noise_sequence;
    return this;
  }

  normalize () {
    // maps any pattern across a full 0.0 - 1.0 range
    let normalized_sequence = [];
    let min = Math.min.apply(Math, this.data);
    let max = Math.max.apply(Math, this.data);
    for (const [key, step] of Object.entries(this.data)) {
      normalized_sequence[key] = (step - min) / (max - min);
    }
    this.data = normalized_sequence;
    return this;
  }

  phasor (periods, length) {
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    if ( length < 1 ) {
      length = 1;
    }
    let phasor_sequence = this.ramp(0,1,length).dup(periods-1);
    this.data = phasor_sequence.data;
    return this;
  }

  ramp (from, to, size) {
    let ramp_sequence = [];
    from = Number(from);
    to = Number(to);
    size = Math.abs(Number(size));
    if ( size < 1 ) {
      size = 1;
    }
    let amount_to_add = parseFloat(Math.abs(to - from) / size);
    if ( to < from ) {
      amount_to_add *= -1;
    }
    for (var i = 0; i < size; i++) {
      ramp_sequence[i] = from;
      from += amount_to_add;
    }
    this.data = ramp_sequence;
    return this;
  }

  randsamp (dir) {
    if (!dir) {
      dir = `./samples/`;
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
      } catch (er) {
        try {
          chosenFile = files[Math.floor(Math.random() * files.length)];
          buffer = fs.readFileSync(`${dir}${chosenFile}`);
          decodedAudio = wav.decode(buffer);
        } catch (err) {
          throw(err);
        }
      }
    } finally {
      if (!decodedAudio) {
        chosenFile = files[Math.floor(Math.random() * files.length)];
        buffer = fs.readFileSync(`${dir}${chosenFile}`);
        decodedAudio = wav.decode(buffer);
      }
      this.data = Array.from(decodedAudio.channelData[0]);
      this.reduce(88200);
      return this;
    }
  }

  sample (file_name) {
    try {
      let buffer = fs.readFileSync(`./samples/${file_name}`);
      let decodedAudio = wav.decode(buffer);
      this.data = Array.from(decodedAudio.channelData[0]);
      return this;
    } catch (e) {
      try {
        let buffer = fs.readFileSync(`${file_name}`);
        let decodedAudio = wav.decode(buffer);
        this.data = Array.from(decodedAudio.channelData[0]);
        return this;
      } catch (err) {
        throw err;
      }
      throw(e);
    }
  }

  sine (periods, length) {
    let sine_sequence = [];
    periods = Math.round(Math.abs(Number(periods)));
    if ( periods < 1 ) {
      periods = 1;
    }
    length = Math.round(Math.abs(Number(length)));
    for (var a = 0; a < periods; a++) {
      for (var i = 0; i < length; i++) {
        let num_scaled = (Math.PI * 2) * (i / length);
        sine_sequence[(a * length) + i] = Number(Math.sin(num_scaled));
      }
    }
    // scale sine from 0 to 1 and make the first sample be 0
    this.data = sine_sequence;
    this.scale(0,1);
    this.shift(((1/periods) * 0.25));
    return this;
  }

  spiral (length, angle_degrees = 137.5, angle_phase_offset = 0) {
    let spiral_sequence = [], i = 1, angle = 360 * angle_phase_offset;
    angle_degrees = Math.abs(Number(angle_degrees));
    length = Math.abs(Number(length));
    if ( length < 1 ) {
      length = 1;
    }
    while ( i <= length ) {
      angle += angle_degrees;
      if (angle > 359) {
        angle = Math.abs(360 - angle);
      }
      // convert degrees back to radians, and then to a 0. - 1. range
      spiral_sequence.push( (angle * (Math.PI/180) ) / (Math.PI * 2) );
      i++;
    }
    this.data = spiral_sequence;
    return this;
  }

  square (periods, length) {
    let square_sequence = [];
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    if (length < 1 ) {
      length = 1;
    }
    for (var a = 0; a < periods; a++) {
      for (var i = 0; i < length; i++) {
        let num_scaled = 0;
        if ( i / length > 0.5 ) {
          num_scaled = 1;
        }
        square_sequence[(a * length) + i] = Number(Math.sin(num_scaled));
      }
    }
    this.data = square_sequence;
    return this;
  }

  tri (periods, length) {
    let tri_sequence = [];
    periods = Math.abs(Number(periods));
    length = Math.abs(Number(length));
    if (length < 1 ) {
      length = 1;
    }
    // create a ramp from 0 to 1
    for (var i = 0; i <= (length - 1); i++) {
      let num_scaled = i / (length - 1);
      tri_sequence[i] = Number(num_scaled);
    }
    // palindrome the ramp to create a triangle, then reduce it to the specified length
    this.data = tri_sequence;
    this.palindrome();
    this.reduce(length);
    this.dup(periods-1);
    return this;
  }

  truncate (length) {
    if ( Number(length) <= 0 ) {
      return [];
    }
    this.data = this.data.slice(0, Number(length));
    return this;
  }

  turing (length) {
    length = Math.abs(Number(length));
    if (length < 1 ) {
      length = 1;
    }
    let turing_sequence = this.noise(length).round();
    this.data = turing_sequence.data;
    return this;
  }
  // END generator operations

  // BEGIN modulator operations
  abs () {
    let abs_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      abs_sequence[key] = Math.abs(step);
    }
    this.data = abs_sequence;
    return this;
  }

  add (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
      out[key] = same_size_arrays[0].data[key] + same_size_arrays[1].data[key];
    }
    this.data = out;
    return this;
  }

  and (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let and_sequence = [];
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    let sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1.data)) {
      if ( step != 0 && sequence2.data[key] != 0 ) {
        and_sequence[key] = 1;
      }
      else {
        and_sequence[key] = 0;
      }
    }
    this.data = and_sequence;
    return this;
  }

  append (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    this.data = this.data.concat(sequence2.data);
    return this;
  }

  at (position, value) {
    let replace_position = Math.round(position * (this.data.length-1));
    this.data[replace_position] = value;
    return this;
  }

  audio () {
    // HPF at ~0hz
    this.biquad(0.998575,-1.99715,0.998575,-1.997146,0.997155);
    // fade first/last 256 samples
    let fade_samples = 256 > Math.floor(this.data.length * 0.5) ? Math.ceil(this.data.length * 0.5) : 256;
    let fade = new FacetPattern().sine(1,fade_samples*2).range(0,0.5);
    for (var i = 0; i < fade.data.length; i++) {
      this.data[i] *= fade.data[i];
    }
    this.reverse();
    for (var i = 0; i < fade.data.length; i++) {
      this.data[i] *= fade.data[i];
    }
    this.reverse();
    return this;
  }

  changed () {
    let changed_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( key == 0 ) {
        if ( step == this.data[this.data.length - 1]) {
          changed_sequence[key] = 0;
        }
        else {
          changed_sequence[key] = 1;
        }
      }
      else {
        if ( step == this.data[key - 1]) {
          changed_sequence[key] = 0;
        }
        else {
          changed_sequence[key] = 1;
        }
      }
    }
    this.data = changed_sequence;
    return this;
  }

  chaos (sequence2, iterations = 100, cx = 0, cy = 0) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
      out[key] = this.chaosInner(same_size_arrays[0].data[key],same_size_arrays[1].data[key],cx,cy,iterations);
    }
    this.data = out;
    return this;
  }

  chaosInner (zx,zy,cx,cy,iterations) {
    let n = 0, px = 0, py = 0, d = 0;
    while (n < iterations) {
      px = (zx*zx) - (zy*zy);
      py = 2 * zx * zy;
      zx = px + cx;
      zy = py + cy;
      d = Math.sqrt((zx*zx)+(zy*zy));
      if ( d > 2 ) {
        break;
      }
      n += 1;
    }
    return Math.abs(1 - (n/iterations));
  }

  clip (min, max) {
    if (!min) {
      min = 0;
    }
    if (!max) {
      max = 0;
    }
    let clipped_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
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
    this.data = clipped_sequence;
    return this;
  }

  mix ( wet_amt, command) {
    // TODO: environment variables such as mousex and mousey are not working inside this scope.
    if ( typeof command != 'function' ) {
      throw `2nd argument must be a function, type found: ${typeof command}`;
    }
    let mix_out = [];
    command = command.toString();
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    let dry = new FacetPattern().from(this.data);
    wet_amt = Math.abs(Number(wet_amt));
    let dry_amt = Math.abs(1 - wet_amt);
    eval(this.utils + command);
    let same_size_arrays = this.makePatternsTheSameSize(this, dry);
    this.data = same_size_arrays[0].data;
    let dry_data = same_size_arrays[1].data;
    for (const [key, step] of Object.entries(this.data)) {
      mix_out[key] = (this.data[key] * wet_amt) + (dry_data[key] * dry_amt);
    }
    this.data = mix_out;
    return this;
  }

  delay (samples, feedback = 1) {
    samples = Math.round(Math.abs(Number(samples)));
    feedback = Number(feedback);
    let copy = new FacetPattern().from(0).dup(samples-1).append(new FacetPattern().from(this.data)).gain(feedback);
    let delay_out = [];
    let original_value;
    for (var i = 0; i < copy.data.length; i++) {
      if ( i >= this.data.length) {
        original_value = 0;
      }
      else {
        original_value = this.data[i];
      }
      delay_out[i] = (original_value + copy.data[i]) * 0.5;
    }
    this.data = delay_out;
    return this;
  }

  convolve (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    this.reduce(88200);
    sequence2.reduce(88200);
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    var al = same_size_arrays[0].data.length;
    var wl = same_size_arrays[1].data.length;
    var offset = ~~(wl / 2);
    var output = new Array(al);
    for (var i = 0; i < al; i++) {
      var kmin = (i >= offset) ? 0 : offset - i;
      var kmax = (i + offset < al) ? wl - 1 : al - 1 - i + offset;
      output[i] = 0;
      for (var k = kmin; k <= kmax; k++)
        output[i] += same_size_arrays[0].data[i - offset + k] * same_size_arrays[1].data[k];
    }
    this.data = output;
    return this;
  }

  curve (tension = 0.5, segments = 25) {
    let curved_sequence = [];
    // interlace a 0 for the x axis value of each sequence value
    let points = [];
    for (var i = 0; i < this.data.length; i++) {
      points.push(0);
      points.push(this.data[i]);
    }
    // run the curve function
    let splinePoints = curve_calc.getCurvePoints(points, tension, segments, false);
    // deinterlace the 0s on the x axis
    for (var i = 0; i < splinePoints.length; i++) {
      if (i % 2 == 0 ) {
        continue;
      }
      curved_sequence.push(splinePoints[i]);
    }
    this.data = curved_sequence;
    return this;
  }

  distavg () {
    let dist_sequence = [];
    let average = this.data.reduce((a, b) => a + b) / this.data.length;
    for (const [key, step] of Object.entries(this.data)) {
      dist_sequence[key] = Number((step - average));
    }
    this.data = dist_sequence;
    return this;
  }

  divide (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
      out[key] = same_size_arrays[0].data[key] / same_size_arrays[1].data[key];
    }
    this.data = out;
    return this;
  }

  dup (num) {
    this.data = Array.from({length: Number(num+1)}).flatMap(a => this.data)
    return this;
  }

  echo (num, feedback) {
    num = Math.round(Math.abs(Number(num)));
    feedback = Number(feedback);
    if ( !feedback ) {
      feedback = 0.666;
    }
    if ( num < 0 ) {
      num = Math.abs(num);
    }
    if ( num === 0 ) {
      return this;
    }
    let original_copy = this.data;
    let original_feedback = feedback;
    for (var x = 0; x < num; x++) {
      this.append(new FacetPattern().from(original_copy).gain(feedback));
      feedback *= feedback;
      if ( Math.abs(feedback) > 4 ) {
        feedback = original_feedback;
      }
    }
    return this;
  }

  equals (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    let sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1.data)) {
      if ( step == sequence2.data[key] ) {
        sequence1.data[key] = 1;
      }
      else {
        sequence1.data[key] = 0;
      }
    }
    this.data = sequence1.data;
    return this;
  }

  fft () {
    this.reduce(this.prevPowerOf2(this.data.length));
    let f = new FFT(this.data.length);
    let out = f.createComplexArray();
    let data = f.toComplexArray(this.data);
    f.transform(out, data);
    this.data = f.fromComplexArray(out);
    return this;
  }

  flipAbove (maximum) {
    maximum = Number(maximum);
    let flipped_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( step > maximum ) {
        let amount_above = Math.abs(Number(step) - Number(maximum));
        flipped_sequence[key] = maximum - amount_above;
      }
      else {
        flipped_sequence[key] = step;
      }
    }
    this.data = flipped_sequence;
    return this;
  }

  flipBelow (min) {
    min = Number(min);
    let flipped_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( step < min ) {
        let amount_below = Math.abs(Number(min) - Number(step));
        flipped_sequence[key] = min + amount_below;
      }
      else {
        flipped_sequence[key] = step;
      }
    }
    this.data = flipped_sequence;
    return this;
  }

  follow (audio, up_samps, down_samps) {
    if ( !this.isFacetPattern(audio) ) {
      throw `input must be a FacetPattern object; type found: ${typeof audio}`;
    }
    up_samps = Math.round(Math.abs(Number(up_samps)));
    down_samps = Math.round(Math.abs(Number(down_samps)));
    this.times(audio.slew(up_samps,down_samps));
    return this;
  }

  fracture (pieces) {
    pieces = Math.round(Math.abs(Number(pieces)));
    let fracture_sequence = [];
    let break_points = [];
    for (var i = 0; i < pieces; i++) {
      break_points.push(Math.floor(Math.random() * this.data.length));
    }
    break_points = new FacetPattern().from(break_points).sort();
    let prev_point = 0;
    let chunks = [];
    let chunk = [];
    for (var i = 0; i < this.data.length; i++) {
      chunk.push(this.data[i]);
      for (var a = 0; a < break_points.data.length; a++) {
        if ( break_points.data[a] == i || i == (this.data.length - 1)) {
          chunks.push(chunk);
          chunk = [];
          break;
        }
      }
    }
    chunks = new FacetPattern().from(chunks).shuffle();
    for (var i = 0; i < chunks.data.length; i++) {
      chunk = chunks.data[i];
      for (var a = 0; a < chunk.length; a++) {
        fracture_sequence.push(chunk[a]);
      }
    }
    this.data = fracture_sequence;
    return this;
  }

  gain (amt) {
    let gain_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      gain_sequence[key] = (Number(step) * Number(amt));
    }
    this.data = gain_sequence;
    return this;
  }

  gt (amt) {
    let gt_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      gt_sequence[key] = (Number(step) > Number(amt)) ? 1 : 0;
    }
    this.data = gt_sequence;
    return this;
  }

  gte (amt) {
    let gte_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      gte_sequence[key] = (Number(step) >= Number(amt)) ? 1 : 0;
    }
    this.data = gte_sequence;
    return this;
  }

  harmonics (ctrl_sequence, amplitude = 0.9) {
    if ( !this.isFacetPattern(ctrl_sequence) ) {
      throw `input must be a FacetPattern object; type found: ${typeof ctrl_sequence}`;
    }
    let harmonics_array = [];
    let harmonics_sequence = [];
    this.reduce(10000);
    ctrl_sequence.reduce(32);
    for (var i = 0; i < ctrl_sequence.data.length; i++) {
      let harmonic_gain = Math.pow(amplitude, i);
      let harmonic = [];
      let ratio = parseFloat(ctrl_sequence.data[i]);
      let num_loops = Math.floor(ratio);
      let fraction_loop = Math.floor((ratio - num_loops) * this.data.length);
      for (var a = 0; a < num_loops; a++) {
        for (var b = 0; b < this.data.length; b++) {
          harmonic.push(this.data[b] * harmonic_gain);
        }
      }
      for (var c = 0; c < fraction_loop; c++) {
        harmonic.push(this.data[c] * harmonic_gain);
      }
      harmonics_array.push(harmonic);
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
    this.data = harmonics_sequence;
    return this;
  }

  ifft () {
    this.reduce(this.prevPowerOf2(this.data.length));
    let f = new FFT(this.data.length);
    let data = f.toComplexArray(this.data);
    let out = f.createComplexArray();
    f.inverseTransform(out, data);
    this.data = f.fromComplexArray(out);
    return this;
  }

  interlace (sequence2) {
      if ( !this.isFacetPattern(sequence2) ) {
        throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
      }
      let interlaced_sequence = [];
      let interlace_every;
      let big_sequence = this, small_sequence = sequence2;
      if ( this.data.length > sequence2.data.length ) {
        interlace_every = parseInt(this.data.length / sequence2.data.length);
        big_sequence.reduce(sequence2.data.length);
      }
      else if ( sequence2.data.length > this.data.length ) {
        interlace_every = parseInt(sequence2.data.length / this.data.length);
        big_sequence = sequence2;
        big_sequence.reduce(this.data.length);
        small_sequence = this;
      }
      else if ( sequence2.data.length == this.data.length ) {
          interlace_every = 1;
      }
      for (const [key, step] of Object.entries(this.data)) {
        interlaced_sequence.push(big_sequence.data[key]);
        if ( Number(key) % interlace_every == 0 ) {
          if ( isNaN(small_sequence.data[key]) ) {
            interlaced_sequence.push(0)
          }
          else {
            interlaced_sequence.push(small_sequence.data[key]);
          }
        }
      }
      this.data = interlaced_sequence;
      return this;
  }

  interp (prob = 0.5, sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let interp_sequence = [];
    let amt = Math.abs(Number(prob));
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    let sequence = same_size_arrays[0];
    let mult_sequence = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence.data)) {
      // linear interpolation between the two provided sequences
      let seq_amt = (1 - amt) * step;
      let mult_amt = amt * mult_sequence.data[key];
      let avg = (seq_amt + mult_amt);
      interp_sequence[key] = avg;
    }
    this.data = interp_sequence;
    return this;
  }

  invert () {
    let inverted_sequence = [];
    let min = Math.min.apply(Math, this.data);
    let max = Math.max.apply(Math, this.data);
    for (const [key, step] of Object.entries(this.data)) {
      inverted_sequence[key] = min + (max - step);
    }
    this.data = inverted_sequence;
    return this;
  }

  jam (prob, amt) {
    amt = Number(amt);
    prob = Number(prob);
    let jammed_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( step != 0 ) {
        if ( Math.random() < prob) {
          // changed
          let step_distance = Math.random() * amt;
          // half the time make it smaller
          if ( Math.random() < 0.5 ) {
            step_distance *= -1;
          }
          jammed_sequence[key] = Number((Number(step) + Number(step_distance)));
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
    this.data = jammed_sequence;
    return this;
  }

  log (base, rotation = 1) {
      this.warp(base, rotation);
      return this;
  }

  biquad(a,b,c,d,e) {
    // implemented based on: https://docs.cycling74.com/max7/tutorials/08_filterchapter02
    a = Number(a);
    b = Number(b);
    c = Number(c);
    d = Number(d);
    e = Number(e);
    let filter_out = [];
    for (var i = 0; i < this.data.length; i++) {
      let prev_step = i-1,prev2_step = i-2;
      if (i == 0) {
        prev_step = this.data.length-1;
        prev2_step = this.data.length-2;
      }
      else if (i == 1) {
        prev_step = 0;
        prev2_step = this.data.length-1;
      }

      if (filter_out.length >= 2) {
        filter_out.push(
            (this.data[i]*a)
          + (this.data[prev_step]*b)
          + (this.data[prev2_step]*c)
          - (filter_out[i-1]*d)
          - (filter_out[i-2]*e)
        );
      }
      else if (filter_out.length == 1) {
        filter_out.push(
            (this.data[i]*a)
          + (this.data[prev_step]*b)
          + (this.data[prev2_step]*c)
          - (filter_out[i-1]*d)
        );
      }
      else {
        filter_out.push(
            (this.data[i]*a)
          + (this.data[prev_step]*b)
          + (this.data[prev2_step]*c)
        );
      }
    }
    this.data = filter_out;
    return this;
  }

  allpass (a = 1) {
    a = Number(a);
    let filter_out = [];
    for (var i = 0; i < this.data.length; i++) {
      let prev_step = i-1;
      if (i == 0) {
        filter_out.push(
          (this.data[i]*a)
        );
      }
      else {
        filter_out.push(
            (this.data[i]*a)
          + (this.data[prev_step])
          - (filter_out[prev_step]*a)
        );
      }
    }
    this.data = filter_out;
    return this;
  }

  lpf (cutoff) {
    // copy-modded from: https://github.com/rochars/low-pass-filter/blob/master/index.js
    let numChannels = 1;
    let rc = 1.0 / (cutoff * 2 * Math.PI);
    let dt = 1.0 / 44100;
    let alpha = dt / (rc + dt);
    let last_val = [];
    let offset;
    for (let i=0; i<numChannels; i++) {
        last_val[i] = this.data[i];
    }
    for (let i=0; i<this.data.length; i++) {
      for (let j=0; j< numChannels; j++) {
          offset = (i * numChannels) + j;
          last_val[j] =
              last_val[j] + (alpha * (this.data[offset] - last_val[j]));
          this.data[offset] = last_val[j];
      }
    }
    return this;
  }

  lt (amt) {
    let lt_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      lt_sequence[key] = (Number(step) < Number(amt)) ? 1 : 0;
    }
    this.data = lt_sequence;
    return this;
  }

  lte (amt) {
    let lte_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      lte_sequence[key] = (Number(step) <= Number(amt)) ? 1 : 0;
    }
    this.data = lte_sequence;
    return this;
  }

  map (fp) {
    if ( !this.isFacetPattern(fp) ) {
      throw `input must be a FacetPattern object; type found: ${typeof fp}`;
    }
    // safeguard against mapping more than 48k samples to another pattern.
    // otherwise it can be very cpu expensive!
    this.reduce(48000);
    let same_size_arrays = this.makePatternsTheSameSize(this, fp);
    let sequence = same_size_arrays[0];
    let new_values = same_size_arrays[1];
    let mapped_sequence = [];
    for (const [key, step] of Object.entries(sequence.data)) {
      mapped_sequence[key] = new_values.data.reduce((a, b) => {
        return Math.abs(b - step) < Math.abs(a - step) ? b : a;
      });
    }
    this.data = mapped_sequence;
    return this;
  }

  modulo (amt) {
    let modulo_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      modulo_sequence[key] = Number(step) % Number(amt);
    }
    this.data = modulo_sequence;
    return this;
  }

  nonzero () {
    let nonzero_sequence = [];
    // initialize prev_val to the last element in the pattern
    let prev_val = this.data[this.data.length-1];
    let cur_val;
    for (const [key, step] of Object.entries(this.data)) {
      cur_val = step;
      if ( Number(cur_val) == 0 ) {
          cur_val = prev_val;
      }
      else {
          prev_val = step;
      }
      nonzero_sequence[key] = cur_val;
    }
    this.data = nonzero_sequence;
    return this;
  }

  offset (amt) {
    amt = Number(amt);
    let offset_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      offset_sequence[key] = Number(step) + Number(amt);
    }
    this.data = offset_sequence;
    return this;
  }

  or (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let or_sequence = [];
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    let sequence1 = same_size_arrays[0];
    sequence2 = same_size_arrays[1];
    for (const [key, step] of Object.entries(sequence1.data)) {
      if ( step != 0 || sequence2.data[key] != 0 ) {
        or_sequence[key] = 1;
      }
      else {
        or_sequence[key] = 0;
      }
    }
    this.data = or_sequence;
    return this;
  }

  palindrome () {
    this.data = this.data.concat(this.reverse().data);
    return this;
  }

  pong (min, max) {
    min = Number(min);
    if (!max) {
      max = min;
      min *= -1;
    }
    max = Number(max);
    let range = [min, max];
    let sorted_range = range.sort(function(a,b) { return a - b;});
    min = sorted_range[0];
    max = sorted_range[1];
    if ( min == max ) {
      throw `Cannot run pong with equal min and max: ${min}`;
    }
    let pong_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
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
    this.data = pong_sequence;
    return this;
  }

  pow (base, rotation = 1) {
      this.warp(base, rotation).invert().reverse();
      return this;
  }

  prob (amt) {
    amt = Number(amt);
    if ( amt < 0 ) {
      amt = 0;
    }
    else if ( amt > 1 ) {
      amt = 1;
    }
    let prob_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( Math.random() < amt ) {
        prob_sequence[key] = step;
      }
      else {
        prob_sequence[key] = 0;
      }
    }
    this.data = prob_sequence;
    return this;
  }

  quantize (resolution) {
    resolution = parseInt(Number(resolution));
    let quantized_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( key % resolution == 0 ) {
        // only pass nonzero steps if the modulo of their key is 0
        quantized_sequence[key] = step;
      }
      else {
        quantized_sequence[key] = 0;
      }
    }
    this.data = quantized_sequence;
    return this;
  }

  range (new_min, new_max) {
    // this is a horizontal range - returns a range of the buffer
    let min = parseInt(Number(new_min) * this.data.length);
    let max = parseInt(Number(new_max) * this.data.length);
    if (max < min) {
      max = parseInt(Number(new_min) * this.data.length);;
      min = parseInt(Number(new_max) * this.data.length);;
    }
    this.data = this.data.slice(min,max);
    return this;
  }

  recurse (prob) {
    // there is no need for the input to this function to ever be huge, and it would
    // be dangerous to remove the limits - could easily max out CPU. remove at your own risk lol
    this.reduce(1024);
    prob = Number(prob);
    if ( prob < 0 ) {
      prob = 0;
    }
    else if ( prob > 1 ) {
      prob = 1;
    }
    let recursive_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( (Math.random() < prob) ) {
        // get two random points in the sequence, and re-insert everything
        // between those two points in this location
        let sub_selection = [];
        let point1 = Math.floor(Math.random() * this.data.length);
        let point2 = Math.floor(Math.random() * this.data.length);
        let points = [point1, point2];
        let sorted_points = points.sort(function(a,b) { return a - b;});
        let i = sorted_points[0];
        while (i <= sorted_points[1] ) {
          sub_selection.push(this.data[i]);
          i++;
        }
        recursive_sequence[key] = sub_selection;
      }
      else {
        recursive_sequence[key] = step;
      }
    }
    this.data = recursive_sequence;
    this.flatten();
    return this;
  }

  reduce (new_size) {
    let orig_size = this.data.length;
    new_size = Number(new_size);
    if ( new_size > orig_size ) {
      return this;
    }
    let reduced_sequence = [];
    for ( let i = 0; i < new_size; i++ ) {
      let large_array_index = Math.floor(i * (orig_size + Math.floor(orig_size / new_size)) / new_size);
      reduced_sequence[i] = this.data[large_array_index];
    }
    this.data = reduced_sequence;
    return this;
  }

  reverse () {
    let reversed_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      reversed_sequence[((this.data.length - 1) - key)] = step;
    }
    this.data = reversed_sequence;
    return this;
  }

  round () {
    let rounded_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      rounded_sequence[key] = Math.round(step);
    }
    this.data = rounded_sequence;
    return this;
  }

  saheach (num) {
    num = Math.round(Math.abs(Number(num)));
    let count = 0;
    let sah_sequence = [];
    let prev_step;
    for (const [key, step] of Object.entries(this.data)) {
      if ( count % num == 0 || key == 0 ) {
        sah_sequence[key] = step;
        prev_step = step;
      }
      else {
        sah_sequence[key] = prev_step;
      }
      count++;
    }
    this.data = sah_sequence;
    return this;
  }

  saturate (gain) {
    if (!gain) {
      gain = 1;
    }
    gain = Number(gain);
    let saturated_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      saturated_sequence[key] = Math.tanh(step * gain);
    }
    this.data = saturated_sequence;
    return this;
  }

  scale (new_min, new_max) {
    if ( this.data.length == 1 ) {
      return [(Number(new_max) + Number(new_min)) / 2];
    }
    // first determine existing range
    let min = Math.min.apply(Math, this.data);
    let max = Math.max.apply(Math, this.data);
    if (!new_max) {
      new_max = new_min;
      new_min *= -1;
    }
    // now scale each value based on new_min, new_max
    let scaled_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      let new_val = this.scaleInner(step, [min,max], [Number(new_min), Number(new_max)]);
      scaled_sequence[key] = Number(new_val);
    }
    this.data = scaled_sequence;
    return this;
  }

  skip (prob) {
    prob = Math.abs(Number(prob));
    if ( Math.random() < prob ) {
      this.skipped = true;
    }
    return this;
  }

  shift (amt) {
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
    let direction = -1 * (amt * this.data.length);
    for (const [key, step] of Object.entries(this.data)) {
      let new_key = Math.round(Number(key) + Number(direction));
      if ( new_key < 0 ) {
        // wrap to end
        new_key = this.data.length - (Math.abs(new_key));
      }
      else if ( new_key >= this.data.length ) {
        // wrap to beginning
        new_key = Math.abs((this.data.length + 1) - new_key);
      }
      moved_sequence[key] = this.data[new_key];
    }
    this.data = moved_sequence;
    return this;
  }

  shuffle () {
    let shuffle_sequence = this.data;
    for (let i = shuffle_sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffle_sequence[i], shuffle_sequence[j]] = [shuffle_sequence[j], shuffle_sequence[i]];
    }
    this.data = shuffle_sequence;
    return this;
  }

  sieve (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    sequence2.normalize();
    let sieve_sequence = [];
    for (var i = 0; i < sequence2.data.length; i++) {
      sieve_sequence.push(this.data[Math.round(sequence2.data[i] * (this.data.length - 1))]);
    }
    this.data = sieve_sequence;
    return this;
  }

  slew (depth = 25, up_speed = 1, down_speed = 1) {
    let initial_size = this.data.length;
    let slewed_sequence = [];
    up_speed = Math.abs(up_speed);
    down_speed = Math.abs(down_speed);
    depth = Math.round(Math.abs(Number(depth)));
    if ( up_speed < 0.02 ) {
      up_speed = 0.02;
    }
    else if ( up_speed > 1 ) {
      up_speed =  1;
    }
    if ( down_speed < 0.02 ) {
      down_speed = 0.02;
    }
    else if ( down_speed > 1 ) {
      down_speed =  1;
    }
    for (const [key, step] of Object.entries(this.data)) {
      let k = Number(key);
        // check if next step up or down
        // if up, run from this step to next step in (up_speed * depth) samples, then hold for rest of depth
        // if down, run from this step to next step in (down_speed * depth) samples, then hold for rest of depth
      if ( !isNaN(this.data[k+1]) ) {
        if ( this.data[k+1] > this.data[k] ) {
          // up
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(up_speed * depth) ) {
              // up slew
              slewed_sequence.push(((Number(this.data[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(this.data[k+1]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(this.data[k+1]);
            }
          }
        }
        else if ( this.data[k+1] < this.data[k] ) {
          // down
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(down_speed * depth) ) {
              // down slew
              slewed_sequence.push(((Number(this.data[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(this.data[k+1]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(this.data[k+1]);
            }
          }
        }
        else {
          // static
          for (var i = 0; i < depth; i++) {
            slewed_sequence.push(this.data[k]);
          }
        }
      }
      else {
        // going back to first val
        if ( this.data[0] > this.data[k] ) {
          // up
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(up_speed * depth) ) {
              // up slew
              slewed_sequence.push(((Number(this.data[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(this.data[0]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(this.data[0]);
            }
          }
        }
        else if ( this.data[0] < this.data[k] ) {
          // down
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(down_speed * depth) ) {
              // down slew
              slewed_sequence.push(((Number(this.data[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(this.data[0]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(this.data[0]);
            }
          }
        }
        else {
          // static
          for (var i = 0; i < depth; i++) {
            slewed_sequence.push(this.data[0]);
          }
        }
      }
    }
    this.data = slewed_sequence;
    return this;
  }

  smooth () {
    let smoothed_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      let k = Number(key);
      if ( k > 0 && ( (k + 1) < this.data.length ) ) {
        // all other steps
        smoothed_sequence[k] = parseFloat(smoothed_sequence[k-1] + this.data[k]) / 2;
      }
      else if ( k +1 ==  this.data.length ) {
        // last step loops around to average with first
        smoothed_sequence[k] = parseFloat(smoothed_sequence[k-1] + this.data[0]) / 2;
      }
      else {
        // first step is static
        smoothed_sequence[k] = step;
      }
    }
    this.data = smoothed_sequence;
    return this;
  }

  speed (ratio) {
    // hard clamp stretch ratio between 0.02083 (48x) and 8
    ratio = Math.abs(Number(ratio));
    if ( ratio < 0.000001 ) {
      ratio = 0.02083;
    }
    if (ratio > 8) {
      ratio = 8;
    }
    let upscaled_data = [];
    let new_samps = Math.floor(ratio * this.data.length);
    let copies_of_each_value = Math.floor(new_samps/this.data.length) + 1;
    for (var n = 0; n < this.data.length; n++) {
      let i = 0;
      while (i < copies_of_each_value) {
        upscaled_data.push(this.data[n]);
        i++;
      }
    }
    this.data = upscaled_data;
    this.reduce(new_samps);
    return this;
  }

  sort () {
    let sorted_sequence = [];
    sorted_sequence = this.data.sort(function(a, b) { return a - b; });
    this.data = sorted_sequence;
    return this;
  }

  sticky (amt) {
    amt = Number(amt);
    if ( amt < 0 ) {
      amt = 0;
    }
    else if ( amt > 1 ) {
      amt = 1;
    }
    let sticky_sequence = [];
    let stuck_key;
    for (const [key, step] of Object.entries(this.data)) {
      if ( Math.random() > amt ) {
        stuck_key = key;
        sticky_sequence[key] = step;
      }
      else {
        if ( this.data[stuck_key] ) {
          sticky_sequence[key] = this.data[stuck_key];
        }
        else {
          sticky_sequence[key] = step;
        }
      }
    }
    this.data = sticky_sequence;
    return this;
  }

  subset (percentage) {
    percentage = Number(percentage);
    if ( percentage < 0 ) {
      percentage = 0;
    }
    else if ( percentage > 1 ) {
      percentage = 1;
    }
    let subset_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if ( Math.random() < percentage ) {
        subset_sequence.push(step);
      }
    }
    this.data = subset_sequence;
    return this;
  }

  subtract (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
      out[key] = same_size_arrays[0].data[key] - same_size_arrays[1].data[key];
    }
    this.data = out;
    return this;
  }

  suspend (start, end) {
    this.reduce(88200);
    let suspend_sequence = [];
    start = Math.abs(Number(start));
    end = Math.abs(Number(end));
    if ( start < 0 ) {
      start = 0;
    }
    else if ( start > 1 ) {
      start = 1;
    }
    if ( end < 0 ) {
      end = 0;
    }
    else if ( end > 1 ) {
      end = 1;
    }
    let sorted = new FacetPattern().from([start,end]).sort();
    start = sorted.data[0];
    end = sorted.data[1];
    let calc_size = Math.abs(end-start);
    if ( calc_size < 0.125 ) {
      // maximum 1/8th resolution
      calc_size = 0.125;
    }
    let size_increase_coefficient = 1 / calc_size;

    let begin_zeroes = Math.round(start * (this.data.length * size_increase_coefficient));
    let end_zeroes = begin_zeroes + this.data.length;
    for (var i = 0; i < (size_increase_coefficient * this.data.length); i++) {
      if ( i < begin_zeroes || i > end_zeroes ) {
        suspend_sequence.push(0);
      }
      else {
        suspend_sequence.push(this.data[i - begin_zeroes]);
      }
    }
    this.data = suspend_sequence;
    return this;
  }

  times (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
    for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
      out[key] = same_size_arrays[0].data[key] * same_size_arrays[1].data[key];
    }
    this.data = out;
    return this;
  }

  unique () {
    this.data = Array.from(new Set(this.data));
    return this;
  }

  walk (prob, amt) {
    // swap some of the locations
    let jammed_sequence = [];
    let x_max = this.data.length - 1;
    amt = Number(amt);
    prob = Number(prob);
    if ( prob < 0 ) {
      prob = 0;
    }
    else if ( prob > 1 ) {
      prob = 1;
    }
    for (const [key, step] of Object.entries(this.data)) {
      if ( Math.random() < prob) {
        // changed
        let step_distance = parseInt((Math.random() * amt));
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
        jammed_sequence[key] = this.data[new_step_location];
        jammed_sequence[new_step_location] = step;
      }
      else {
        // unchanged
        jammed_sequence[key] = step;
      }
    }
    this.data = jammed_sequence;
    return this;
  }

  warp (base, rotation = 1) {
    // forked from: https://github.com/naomiaro/fade-curves/blob/master/index.js
    let warp_sequence = [];
    let length = this.data.length;
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
      let foo = Math.round(Number(curve[a]) * length);
      if (foo >= this.data.length ) {
          foo = this.data.length - 1;
      }
      warp_sequence[a] = this.data[foo];
    }
    this.data = warp_sequence;
    return this;
  }

  // END modulator operations

  // WINDOW operations
  applyWindow (signal, func) {
    var i, n = signal.length, args = [0,n];
    // pass rest of args
    for(i = 2; i < arguments.length; i++) {
      args[i] = arguments[i]
    }
    for ( i = n-1; i >= 0; i-- ) {
      args[0] = i;
      signal[i] *= func.apply(null,args);
    }
    return signal;
  }

  fade () {
    this.data = this.applyWindow(this.data, this.hamming);
    return this;
  }

  flattop () {
    this.data = this.applyWindow(this.data, this.flatTopInner);
    return this;
  }

  flatTopInner (i,N) {
    var a0 = 1,
        a1 = 1.93,
        a2 = 1.29,
        a3 = 0.388,
        a4 = 0.028,
        f = 6.283185307179586*i/(N-1)

    return a0 - a1*Math.cos(f) +a2*Math.cos(2*f) - a3*Math.cos(3*f) + a4 * Math.cos(4*f)
  }

  hamming (i,N) {
    return 0.54 - 0.46 * Math.cos(6.283185307179586*i/(N-1));
  }
  // END WINDOW operations. shimmed from https://github.com/scijs/window-function

  // BEGIN audio operations
  ichunk (sequence2) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    let chunk_length = Math.floor(this.data.length / sequence2.data.length);
    for (var i = 0; i < sequence2.data.length; i++) {
      let chunk_start_index = Math.floor(sequence2.data[i] * this.data.length);
      let chunk_end_index = chunk_start_index + chunk_length;
      let chunk = [];
      for (var a = chunk_start_index; a < chunk_end_index; a++) {
        chunk.push(this.data[a]);
      }
      let chunk_fp = new FacetPattern().from(chunk).fade();
      out.push(chunk_fp.data);
    }
    this.data = out;
    this.flatten();
    return this;
  }

  mutechunks (chunks, prob) {
    if ( !chunks ) {
      chunks = 16;
    }
    if ( !prob ) {
      prob = 0.75;
    }
    let chunk_length = Math.floor(this.data.length / chunks);
    let out = [];
    let min, max;
    for (var i = 0; i < chunks; i++) {
      let chunk_fp;
      min = i * chunk_length;
      max = min + chunk_length;
      if ( Math.random() < prob ) {
        chunk_fp = new FacetPattern().from(0).dup(chunk_length-1).fade();
      }
      else {
        chunk_fp = new FacetPattern().from(this.data.slice(min,max)).fade();
      }
      out.push(chunk_fp.data);
    }
    this.data = out;
    this.flatten();
    return this;
  }
  // END audio operations

  // BEGIN special operations
  cc (controller = 70, channel = 0) {
    if ( typeof controller != 'number' ) {
      throw `.cc() 1st argument: controller must be a number; type found: ${typeof controller}`;
    }
    if ( typeof channel != 'number' ) {
      throw `.cc() 2nd argument: channel must be a number; type found: ${typeof channel}`;
    }
    this.scale(Math.min(...this.data)*127,Math.max(...this.data) * 127);
    this.cc_data.push({
      data:this.data,
      controller:controller,
      channel:channel
    });
    return this;
  }

  get (varname) {
    if ( typeof this.stored_patterns[varname] == 'undefined') {
      throw `No pattern found with name: ${varname}. Patterns must be created with .set() in a prior command before running .get()`;
    }
    this.data = this.stored_patterns[varname];
    return this;
  }

  iter (times, prob, command) {
    // TODO: environment variables such as mousex and mousey are not working inside this scope.
    prob = Math.abs(Number(prob));
    times = Math.abs(Math.round(Number(times)));
    if ( times == 0 ) {
      return this;
    }
    else if ( times > 128 ) {
      times = 128;
    }
    if ( typeof command != 'function' ) {
      throw `3rd argument to .iter() must be a function, type found: ${typeof command}`;
    }
    command = command.toString();
    command = command.replace(/current_slice./g, 'this.');
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    for (var i = 0; i < times; i++) {
      if ( Math.random() < prob ) {
        eval(this.utils + command);
      }
    }
    return this;
  }

  note (velocity = new FacetPattern().from(100), duration = new FacetPattern().from(125), channel = 0) {
    if ( typeof velocity == 'number' || Array.isArray(velocity) === true ) {
      velocity = new FacetPattern().from(velocity);
    }
    if ( typeof duration == 'number' || Array.isArray(duration) === true ) {
      duration = new FacetPattern().from(duration);
    }
    if ( typeof channel != 'number' ) {
      throw `3rd argument to .note(): channel must be a number; type found: ${typeof channel}`;
    }
    this.notes.push({
      data:this.data,
      velocity:velocity,
      duration:duration,
      channel:channel
    });
    return this;
  }

  on (hook = 0, every = 1) {
    if ( typeof hook == 'number' ) {
      hook = [hook];
    }
    else if ( this.isFacetPattern(hook) ) {
      hook = hook.data;
    }
    if ( !this.name ) {
      throw `the .on() function requires a named FacetPattern. No FacetPattern name found.`;
    }
    if ( typeof every != 'number' ) {
      throw `2nd argument to .on() must be a number; type found : ${typeof every}`;
    }
    Object.values(hook).forEach(h => {
      this.hooks.push([h,every]);
    });
    return this;
  }

  pitchbend (channel = 0) {
    if ( typeof channel != 'number' ) {
      throw `1st argument to .pitchbend(): channel must be a number; type found: ${typeof channel}`;
    }
    this.scale(Math.min(...this.data)*16384,Math.max(...this.data) * 16384).round();
    this.pitchbend_data.push({
      data:this.data,
      channel:channel
    });
    return this;
  }

  play (sequence = 0 ) {
    if ( typeof sequence == 'number' ) {
      sequence = [sequence];
    }
    else if ( this.isFacetPattern(sequence) ) {
      sequence = sequence.data;
    }
    if ( Array.isArray(sequence) === false ) {
      throw `input to .play() must be an array or number; type found: ${typeof sequence}`;
    }
    if (sequence.length > 128 ) {
      throw `input to .play() cannot exceed 128 values; total length: ${sequence.length}`;
    }
    Object.values(sequence).forEach(s => {
      this.sequence_data.push(s);
    });
    return this;
  }

  repeat (sequence = 0) {
    if ( typeof sequence == 'number' ) {
      sequence = [sequence];
    }
    else if ( this.isFacetPattern(sequence) ) {
      sequence = sequence.data;
    }
    if ( Array.isArray(sequence) === false ) {
      throw `input to .play() must be an array or number; type found: ${typeof sequence}`;
    }
    if (sequence.length > 128 ) {
      throw `input to .play() cannot exceed 128 values; total length: ${sequence.length}`;
    }
    this.looped = true;
    this.play(sequence);
    return this;
  }

  saveAs (filename) {
    let a_wav = new WaveFile();
    a_wav.fromScratch(1, 44100, '32f', this.data);
    fs.writeFileSync(`samples/${filename}.wav`, a_wav.toBuffer(),(err) => {});
    return this;
  }

  set (varname) {
    this.store.push(varname);
    return this;
  }

  slices (num_slices, prob, command) {
    // TODO: environment variables such as mousex and mousey are not working inside this scope.
    let out = [];
    prob = Math.abs(Number(prob));
    num_slices = Math.abs(Math.round(Number(num_slices)));
    let foreach_sequence = [];
    if ( num_slices == 0 ) {
      return sequence;
    }
    if ( typeof command != 'function' ) {
      throw `3rd argument must be a function, type found: ${typeof command}`;
    }
    command = command.toString();
    command = command.replace(/this./g, 'current_slice.');
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    let calc_slice_size = Math.round(this.data.length / num_slices);
    let slice_start_pos, slice_end_pos;
    let current_slice;
    for (var i = 0; i < num_slices; i++) {
      slice_start_pos = i * calc_slice_size;
      slice_end_pos = slice_start_pos + calc_slice_size;
      current_slice = new FacetPattern().from(this.data).range(slice_start_pos/this.data.length, slice_end_pos/this.data.length);
      if ( Math.random() < prob ) {
        current_slice = eval(this.utils + command);
      }
      out.push(current_slice.data);
    }
    this.data = out;
    return this.flatten();
  }

  sometimes (prob, command) {
    // TODO: environment variables such as mousex and mousey are not working inside this scope.
    if ( typeof command != 'function' ) {
      throw `2nd argument must be a function, type found: ${typeof command}`;
    }
    command = command.toString();
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    prob = Math.abs(Number(prob));
    if ( Math.random() < prob ) {
      eval(this.utils + command);
    }
    return this;
  }
  // END special operations

  // BEGIN utility functions used in other methods
  flatten () {
    let out = [];
    Object.values(this.data).forEach(step => {
      if ( Array.isArray(step) ) {
        for (var i = 0; i < step.length; i++) {
          out.push(step[i]);
        }
      }
      else {
        out.push(step);
      }
    });
    this.data = out;
    return this;
  }

  getPatterns() {
    try {
      return JSON.parse(fs.readFileSync('js/stored.json', 'utf8', (err, data) => {
        return data
      }));
    } catch (e) {
      return {};
    }
  }

  getUtils() {
    return fs.readFileSync('js/utils.js', 'utf8', (err, data) => {
      return data;
    });
  }

  isFacetPattern(t) {
    if ( typeof t == 'object' && t.constructor.name == 'FacetPattern' ) {
      return true;
    }
    else {
      return false;
    }
  }

  makePatternsTheSameSize (sequence1, sequence2) {
    // make whichever one is smaller, fit the larger one's size.
    if ( sequence1.data.length > sequence2.data.length ) {
      sequence2 = sequence2.speed((sequence1.data.length / sequence2.data.length));
    }
    else if ( sequence2.data.length > sequence1.data.length ) {
      sequence1 = sequence1.speed((sequence2.data.length / sequence1.data.length));
    }
    return [sequence1, sequence2];
  }

  prevPowerOf2 (n) {
      var count = -1;
      if ( n && ! ( n & ( n - 1 ))) {
        return n;
      }
      while ( n != 0) {
        n >>= 1;
        count += 1;
      }
      return 1 << count;
  }

  scaleInner (value, r1, r2) {
      return ( value - r1[ 0 ] ) * ( r2[ 1 ] - r2[ 0 ] ) / ( r1[ 1 ] - r1[ 0 ] ) + r2[ 0 ];
  }

  scaleThePattern (arrayToScale, nTimes) {
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
  }
  // END utility functions
}

module.exports = FacetPattern;
