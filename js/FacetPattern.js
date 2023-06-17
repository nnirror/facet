"use strict";
const fs = require('fs');
const path = require('path');
const wav = require('node-wav');
const WaveFile = require('wavefile').WaveFile;
const FacetConfig = require('./config.js');
const FACET_SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
const curve_calc = require('./lib/curve_calc.js');
const Freeverb = require('./lib/Freeverb.js').Freeverb;
const KarplusStrongString = require('./lib/KarplusStrongString.js').KarplusStrongString;
const FFT = require('./lib/fft.js');
const { Midi, Scale } = require('tonal');
const readimage = require('readimage');
let cross_platform_slash = process.platform == 'win32' ? '\\' : '/';

class FacetPattern {
  constructor (name) {
    this.name = name ? name : Math.random();
    this.bpm_pattern = false;
    this.cc_data = [];
    this.chord_intervals = [];
    this.dacs = '1 1';
    this.data = [];
    this.do_not_regenerate = false;
    this.env = this.getEnv();
    this.executed_successfully = true;
    this.key_data = false;
    this.loops_since_generation = 1;
    this.bpm_at_generation_time = -1;
    this.notes = [];
    this.play_once = false;
    this.regenerate_every_n_loops = 1;
    this.original_command = '';
    this.osc_data = [];
    this.pitchbend_data = [];
    this.sequence_data = [];
    this.skipped = false;
    this.utils = this.env + this.getUtils();
  }

  // BEGIN generator operations
  binary (number,sequence_length) {
    let num = Math.round(Math.abs(number));
    let binary = (num % 2).toString();
    for (; num > 1; ) {
        num = parseInt(num / 2);
        binary =  (num % 2) + (binary);
    }
    if (sequence_length) {
      sequence_length = Math.round(Math.abs(sequence_length));
      binary = binary.substring(0,sequence_length);
      if (binary.length < sequence_length) {
        let zeroes_to_add = sequence_length - binary.length;
        for (var i = 0; i < zeroes_to_add; i++) {
          binary = 0 + binary;
        }
      }
    }
    binary = binary.split('');
    for (var i = 0; i < binary.length; i++) {
      binary[i] = Number(binary[i]);
    }
    this.data = binary;
    return this;
  }

  envelope(env_data) {
    if ( Array.isArray(env_data) === false ) {
      throw `input to envelope must be an array; type found: ${typeof env_data}`;
    }
    if ( env_data.length % 3 != 0 ) {
      throw `input to envelope must be an array evenly disible into groups of three; total length: ${typeof env_data.length}`;
    }
    let env_sequence = new FacetPattern();
    let from, to, duration;
    for (var i = 0; i < env_data.length; i+=3) {
      from = Math.round(Math.abs(Number(env_data[i])));
      to = Math.round(Math.abs(Number(env_data[i+1])));
      duration = Math.round(Math.abs(Number(env_data[i+2])));
      env_sequence.append(new FacetPattern().ramp(from,to,duration));
    }
    this.data = env_sequence.data;
    return this;
  }

  cosine(frequencies, length = FACET_SAMPLE_RATE, sampleRate = FACET_SAMPLE_RATE) {
    let output = [];
    if (typeof frequencies == 'number' || Array.isArray(frequencies) === true) {
        frequencies = new FacetPattern().from(frequencies);
    }
    frequencies.size(length);
    let phase = 0;
    for (let i = 0; i < length; i++) {
        let t = i / sampleRate;
        let currentFrequency = frequencies.data[i];
        output[i] = Math.cos(phase);
        phase += 2 * Math.PI * currentFrequency / sampleRate;
        if (phase >= 2 * Math.PI) {
            phase -= 2 * Math.PI;
        }
    }
    this.data = output;
    this.fadeoutSamples(Math.round((FACET_SAMPLE_RATE/1000)*30));
    return this;
  }

  from (list) {
    if ( typeof list == 'number' ) {
      list = [list];
    }
    if (!list) {
      list = [];
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

  euclid (pulses, steps) {
    pulses = Math.abs(Math.floor(Number(pulses)));
    steps = Math.abs(Math.floor(Number(steps)));
    let sequence = [];
    let counts = new Array(pulses).fill(1);
    let remainders = new Array(steps - pulses).fill(0);
    let divisor = Math.floor(steps / pulses);
    let max_iters = 100;
    let current_iter = 0;
    while (true) {
        for (let i = 0; i < remainders.length; i++) {
            counts.push(divisor);
        }
        if (remainders.length <= 1 || current_iter >= max_iters ) {
            break;
        }
        steps = remainders.length;
        pulses = counts.length - steps;
        remainders = counts.splice(pulses);
        divisor = Math.floor(steps / pulses);
        current_iter++;
    }
    for (let i = 0; i < counts.length; i++) {
        for (let j = 0; j < counts[i]; j++) {
            sequence.push(1);
        }
        if (i < remainders.length) {
            for (let j = 0; j < remainders[i]; j++) {
                sequence.push(0);
            }
        }
    }
    this.data = sequence;
    return this;
  }

  primes(n, offset = 2, skip = 1) {
    n = Math.abs(Math.floor(Number(n)));
    if ( n == 0 ) {
      return this;
    }
    const primes = [];
    let num = 2;
    let skipped = 0;
    while (primes.length < n) {
        let isPrime = true;
        for (let i = 2; i <= Math.sqrt(num); i++) {
            if (num % i === 0) {
                isPrime = false;
                break;
            }
        } 
        if (isPrime && num >= offset) {
            if (skipped === skip) {
                primes.push(num);
                skipped = 0;
            } else {
                skipped++;
            }
        }
        num++;
    }
    this.data = primes;
    return this;
  }

  image (imagePath, samplesPerColumn = Math.floor(FACET_SAMPLE_RATE / 10), nyquistFrequency = FACET_SAMPLE_RATE / 2, frequencyOffset = 0) {
    const fileData = fs.readFileSync(imagePath);
    let imageData;

    readimage(fileData, function (err, image) {
      if (err) {
        throw `image file: ${imagePath} could not be read correctly. Make sure the file is a JPEG, and try re-exporting it with GIMP or another image editor.`;
      }
      imageData = image;
    });
    samplesPerColumn = Math.round(samplesPerColumn);
    const frequencyStep = nyquistFrequency / imageData.height;
    const audioData = [];
  
    for (let x = 0; x < imageData.width; x++) {
      const columnData = new Array(samplesPerColumn).fill(0);
  
      for (let y = 0; y < imageData.height; y++) {
        const pixelIndex = (y * imageData.width + x) * 4;
        const r = imageData.frames[0].data[pixelIndex];
        const g = imageData.frames[0].data[pixelIndex + 1];
        const b = imageData.frames[0].data[pixelIndex + 2];
        const brightness = (r + g + b) / (255 * 3);
  
        const frequency = y * frequencyStep;
  
        for (let i = 0; i < samplesPerColumn; i++) {
          const sineWave = Math.sin(Math.abs((nyquistFrequency-frequency) + frequencyOffset) * i * Math.PI * 2 / FACET_SAMPLE_RATE);
          columnData[i] += sineWave * brightness;
        }
      }

      const fadeInLength = Math.floor(FACET_SAMPLE_RATE / 33);
      const fadeOutLength = Math.floor(FACET_SAMPLE_RATE / 33);
      for (let i = 0; i < fadeInLength; i++) {
          columnData[i] *= i / fadeInLength;
      }
      for (let i = 0; i < fadeOutLength; i++) {
          columnData[samplesPerColumn - 1 - i] *= i / fadeOutLength;
      }
      audioData.push(columnData);
    }

    let maxAmplitude = 0;
    for (let x = 0; x < audioData.length; x++) {
        for (let y = 0; y < samplesPerColumn; y++) {
            maxAmplitude = Math.max(maxAmplitude, Math.abs(audioData[x][y]));
        }
    }

    for (let x = 0; x < audioData.length; x++) {
        for (let y = 0; y < samplesPerColumn; y++) {
            audioData[x][y] /= maxAmplitude;
        }
    }

    this.data = audioData;
    this.data = this.fadeArrays(this.data);
    this.data = this.sliceEndFade(this.data);
    this.flatten();
    return this;
  }

  noise (length) {
    let noise_sequence = [];
    length = Math.abs(Math.round(Number(length)));
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

  phasor(frequencies, duration = FACET_SAMPLE_RATE, sampleRate = FACET_SAMPLE_RATE) {
    if (typeof frequencies == 'number' || Array.isArray(frequencies) === true) {
        frequencies = new FacetPattern().from(frequencies);
    }
    frequencies.size(duration);
    let wave = [];
    for (let i = 0; i < duration; i++) {
        let frequency = frequencies.data[i];
        let samplesPerCycle = sampleRate / frequency;
        let t = i / samplesPerCycle;
        wave[i] = t - Math.floor(t);
    }
    this.data = wave;
    this.fadeoutSamples(Math.round((FACET_SAMPLE_RATE/1000)*30));
    return this;
  }

  ramp (from, to, size, curveType = 0.5) {
    from = Number(from);
    to = Number(to);
    size = Math.abs(Number(size));
    curveType = Number(curveType);
    for (let i = 0; i < size; i++) {
        let t = i / (size - 1);
        if (curveType < 0.5) {
            t = Math.pow(t, 1 + (0.5 - curveType) * 2);
        } else if (curveType > 0.5) {
            t = Math.pow(t, 1 / (1 + (curveType - 0.5) * 2));
        }
        let value = from + t * (to - from);
        this.data.push(value);
    }
    return this;
  }

  randsamp (dir) {
    if (!dir) {
      dir = `.${cross_platform_slash}samples`;
    }
    let files, chosenFile;
    try {
      // try loading the directory exactly as it's supplied
      files = fs.readdirSync(dir);
      chosenFile = files[Math.floor(Math.random() * files.length)];
    } catch (e) {
      // try appending './samples' to the supplied directory name
      try {
        dir = `${process.cwd()}${cross_platform_slash}samples${cross_platform_slash}${dir}`;
        files = fs.readdirSync(dir);
        chosenFile = files[Math.floor(Math.random() * files.length)];
      } catch (er) {
        // directory not found
        throw er;
      }
    }
    let buffer;
    let fp_found = false;
    let load_attempts = 0;
    while ( fp_found !== true ) {
      if ( load_attempts > 32 ) {
        throw `error in randsamp(): the supplied directory ${dir} failed to find a sample file 32 times in a row`
      }
      try {
        buffer = fs.readFileSync(`${dir}${cross_platform_slash}${chosenFile}`);
        this.data = this.loadBuffer(buffer);
        fp_found = true;
      } catch (e) {
        try {
          // samples with a different bit depth might need to be converted to 32f
          // converted to 32f bit depth, otherise they don't load properly.
          let wav = new WaveFile(fs.readFileSync(`${dir}${cross_platform_slash}${chosenFile}`));
          wav.toBitDepth("32f");
          this.data = wav.getSamples();
          return this.flatten();
        } catch (err) {
          load_attempts++;
          chosenFile = files[Math.floor(Math.random() * files.length)];
        }
      }
    }
    this.flatten();
    return this;
  }

  rect(frequencies, duration = FACET_SAMPLE_RATE, pulseWidth = 0.5, sampleRate = FACET_SAMPLE_RATE) {
    if (typeof frequencies == 'number' || Array.isArray(frequencies) === true) {
        frequencies = new FacetPattern().from(frequencies);
    }
    frequencies.size(duration);
    let wave = [];
    let amplitude = 1;
    for (let i = 0; i < duration; i++) {
        let frequency = frequencies.data[i];
        let samplesPerCycle = sampleRate / frequency;
        let t = i / samplesPerCycle;
        wave[i] = (t - Math.floor(t) < pulseWidth) ? amplitude : -amplitude;
    }
    this.data = wave;
    this.fadeoutSamples(Math.round((FACET_SAMPLE_RATE/1000)*30));
    return this;
}

  stitchdir (dir, samplesBetweenEachFile, saved_filename = 'stitched') {
    if ( !samplesBetweenEachFile ) {
      throw `the second argument to stitchdir() is required: you must specify the number of samples separating each file`;
    }

    if ( typeof samplesBetweenEachFile == 'number' ) {
      samplesBetweenEachFile = [samplesBetweenEachFile];
    }

    if ( this.isFacetPattern(samplesBetweenEachFile) ) {
      samplesBetweenEachFile = samplesBetweenEachFile.data;
    }

    // these are safeguards so this command runs when and only when the user initializes it, rather than each loop
    this.play_once = true;
    this.do_not_regenerate = true;

    let stitchDir = dir;
    if (!dir) {
      stitchDir = `${process.cwd()}${cross_platform_slash}samples`;
    }
    else {
      stitchDir = `${process.cwd()}${cross_platform_slash}samples${cross_platform_slash}${dir}`;
    }
    let out_fp = new FacetPattern();
    let silence_samples_to_add = 0;
    let iters = 0;
    fs.readdir(stitchDir, (err, files) => {
      if (err) throw err;
      files
        .filter(file => path.extname(file) === '.wav')
        .sort()
        .forEach(file => {
          let next_fp_to_add = new FacetPattern().sample(`${dir}${cross_platform_slash}${file}`).prepend(new FacetPattern().silence(silence_samples_to_add));
          out_fp.sup(next_fp_to_add,0);
          silence_samples_to_add += samplesBetweenEachFile[iters%samplesBetweenEachFile.length]
          iters++;
        });
        out_fp.saveas(`${dir}${cross_platform_slash}${saved_filename}`);
    });
    return this;
  }

  sample (file_name) {
    if ( !file_name.includes('.wav') ) {
      file_name = `${file_name}.wav`;
    }
    // first, try loading from the samples directory
    try {
      let buffer = fs.readFileSync(`${process.cwd()}${cross_platform_slash}samples${cross_platform_slash}${file_name}`);
      this.data = this.loadBuffer(buffer);
      return this.flatten();
    } catch (e) {
      try {
        // next, try loading from an absolute file location
        let buffer = fs.readFileSync(`${file_name}`);
        this.data = this.loadBuffer(buffer);
        return this.flatten();
      }
      catch (er) {
        try {
          // samples with a different bit depth might need to be converted to 32f
          // converted to 32f bit depth, otherise they don't load properly.
          // first try from the absolute file location
          let wav = new WaveFile(fs.readFileSync(`${file_name}`));
          wav.toBitDepth("32f");
          this.data = wav.getSamples();
          return this.flatten();
        } catch (err) {
          try {
            // then try from the samples directory
            let wav = new WaveFile(fs.readFileSync(`${process.cwd()}${cross_platform_slash}samples${cross_platform_slash}${file_name}`));
            wav.toBitDepth("32f");
            this.data = wav.getSamples();
            return this.flatten();
          }
          catch (error) {
            // can't find the wav file
            throw error;
          }
        }
      }
    }
  }

  silence (length) {
    length = Math.abs(Math.floor(length));
    this.data = new Array(length).fill(0);
    return this;
  }

  file (file_name) {
    try {
      // first try loading the file from the files directory
      this.data = fs.readFileSync(`${process.cwd()}${cross_platform_slash}files${cross_platform_slash}${file_name}`, (err, data) => {
        return [...data];
      }).toJSON().data;
    }
    catch (e) {
      try {
        // then try loading the resource exactly as provided
        this.data = fs.readFileSync(`${file_name}`, (err, data) => {
          return [...data];
        }).toJSON().data;
      }
      catch (er) {
        throw er;
      } 
    }
    this.full().audio();
    return this;
  }

  randfile(dir) {
    if (!dir) {
      dir = `.${cross_platform_slash}files`;
    }
    var files = fs.readdirSync(dir);
    let chosenFile = files[Math.floor(Math.random() * files.length)];
    try {
      this.data = fs.readFileSync(`${dir}/${chosenFile}`, (err, data) => {
        return [...data];
      }).toJSON().data;
    } catch (e) {
      try {
        this.data = fs.readFileSync(`${dir}${cross_platform_slash}${chosenFile}`, (err, data) => {
          return [...data];
        }).toJSON().data;
      } catch (er) {
        try {
          this.data = fs.readFileSync(`${dir}${cross_platform_slash}${chosenFile}`, (err, data) => {
            return [...data];
          }).toJSON().data;
        } catch (err) {
          throw(err);
        }
      }
    } finally {
      this.reduce(FACET_SAMPLE_RATE).scale(-1,1);
      return this;
    }
  }

  sine (frequencies, length = FACET_SAMPLE_RATE, sampleRate = FACET_SAMPLE_RATE) {
    let output = [];
    if ( typeof frequencies == 'number' || Array.isArray(frequencies) === true ) {
      frequencies = new FacetPattern().from(frequencies);
    }
    frequencies.size(length);
    let phase = 0;
    for (let i = 0; i < length; i++) {
        let t = i / sampleRate;
        let currentFrequency = frequencies.data[i];
        output[i] = Math.sin(phase);
        phase += 2 * Math.PI * currentFrequency / sampleRate;
        if (phase >= 2 * Math.PI) {
            phase -= 2 * Math.PI;
        }
    }
    this.data = output;
    this.fadeoutSamples(Math.round((FACET_SAMPLE_RATE/1000)*30));
    return this;
  }

  spiral (length, angle_degrees = 360/length, angle_phase_offset = 0) {
    angle_phase_offset = Math.abs(Number(angle_phase_offset));
    let spiral_sequence = [], i = 1, angle = 360 * angle_phase_offset;
    angle_degrees = Math.abs(Number(angle_degrees));
    length = Math.abs(Number(length));
    if ( length < 1 ) {
      length = 1;
    }
    while ( i <= length ) {
      angle += angle_degrees;
      if (angle >= 360) {
        angle = Math.abs(360 - angle);
      }
      // convert degrees back to radians, and then to a 0. - 1. range
      spiral_sequence.push( (angle * (Math.PI/180) ) / (Math.PI * 2) );
      i++;
    }
    this.data = spiral_sequence;
    return this;
  }

  square (frequencies, duration = FACET_SAMPLE_RATE, sampleRate = FACET_SAMPLE_RATE) {
    if (typeof frequencies == 'number' || Array.isArray(frequencies) === true) {
        frequencies = new FacetPattern().from(frequencies);
    }
    frequencies.size(duration);
    let wave = [];
    let amplitude = 1;
    let phase = 0;
    for (let i = 0; i < duration; i++) {
        let frequency = frequencies.data[i];
        wave[i] = (phase < 0.5) ? amplitude : -amplitude;
        phase += frequency / sampleRate;
        phase -= Math.floor(phase);
    }
    this.data = wave;
    this.fadeoutSamples(Math.round((FACET_SAMPLE_RATE/1000)*30));
    return this;
  }
  
  tri (frequencies, duration = FACET_SAMPLE_RATE, sampleRate = FACET_SAMPLE_RATE) {
    if (typeof frequencies == 'number' || Array.isArray(frequencies) === true) {
        frequencies = new FacetPattern().from(frequencies);
    }
    frequencies.size(duration);
    let wave = [];
    let amplitude = 1;
    let phase = 0;
    for (let i = 0; i < duration; i++) {
        let frequency = frequencies.data[i];
        wave[i] = 2 * amplitude * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - amplitude;
        phase += frequency / sampleRate;
        phase -= Math.floor(phase);
    }
    this.data = wave;
    this.fadeoutSamples(Math.round((FACET_SAMPLE_RATE/1000)*30));
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

  add (sequence2, match_sizes = true) {
    if ( typeof sequence2 == 'number' || Array.isArray(sequence2) === true ) {
      sequence2 = new FacetPattern().from(sequence2);
    }
    let out = [];
    if (match_sizes != false) {
      let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
      for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
        out[key] = same_size_arrays[0].data[key] + same_size_arrays[1].data[key];
      }
    }
    else {
      if (this.data.length >= sequence2.data.length) {
        for (const [key, step] of Object.entries(this.data)) {
          if (isNaN(sequence2.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step + sequence2.data[key];
          }
        }
      }
      else {
        for (const [key, step] of Object.entries(sequence2.data)) {
          if (isNaN(this.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step + this.data[key];
          }
        }
      }
    }
    this.data = out;
    this.fixnan();
    return this;
  }

  and (sequence2, match_sizes = true) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    if (match_sizes != false) {
      let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
      for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
        out[key] = (same_size_arrays[0].data[key] != 0) && (same_size_arrays[1].data[key] != 0);
      }
    }
    else {
      if (this.data.length >= sequence2.data.length) {
        for (const [key, step] of Object.entries(this.data)) {
          if (isNaN(sequence2.data[key])) {
            out[key] = (step != 0);
          }
          else {
            out[key] = (step != 0) && (sequence2.data[key] != 0);
          }
        }
      }
      else {
        for (const [key, step] of Object.entries(sequence2.data)) {
          if (isNaN(this.data[key])) {
            out[key] = (step != 0);
          }
          else {
            out[key] = (step != 0) && (this.data[key] != 0);
          }
        }
      }
    }
    this.data = out.map(bool => bool ? 1 : 0);
    return this;
  }

  bitshift (shift = 16) {
    shift = Math.abs(Math.floor(Number(shift))) % 32;
    let min = Math.min.apply(Math, this.data);
    let max = Math.max.apply(Math, this.data);
    this.scale(0,1000000).round();
    let result = [];
    for (let i = 0; i < this.data.length; i++) {
        this.data[i] = parseInt(this.data[i]);
        result.push((this.data[i] << shift) | (this.data[i] >>> (32 - shift)));
    }
    this.data = result;
    this.scale(min, max);
    return this;
  }

  key (key_string = "C major") {
    // get the chroma: Midi.pcsetNearest(Scale.get(key_string).chroma)
    let chroma_key = Scale.get(key_string).chroma;
    let key_letter = key_string.split(' ')[0].toLowerCase();

    if ( key_letter == 'a' ) {
      chroma_key = this.stringLeftRotate(chroma_key,3);
    }
    else if ( key_letter == 'a#' ) {
      chroma_key = this.stringLeftRotate(chroma_key,2);
    }
    else if ( key_letter == 'b' ) {
      chroma_key = this.stringLeftRotate(chroma_key,1);
    }
    else if ( key_letter == 'c' ) {
      // no rotation needed, chroma defaults to c at root
    }
    else if ( key_letter == 'c#' ) {
      chroma_key = this.stringRightRotate(chroma_key,1);
    }
    else if ( key_letter == 'd' ) {
      chroma_key = this.stringRightRotate(chroma_key,2);
    }
    else if ( key_letter == 'd#' ) {
      chroma_key = this.stringRightRotate(chroma_key,3);
    }
    else if ( key_letter == 'e' ) {
      chroma_key = this.stringRightRotate(chroma_key,4);
    }
    else if ( key_letter == 'f' ) {
      chroma_key = this.stringRightRotate(chroma_key,5);
    }
    else if ( key_letter == 'f#' ) {
      chroma_key = this.stringRightRotate(chroma_key,6);
    }
    else if ( key_letter == 'g' ) {
      chroma_key = this.stringRightRotate(chroma_key,7);
    }
    else if ( key_letter == 'g#' ) {
      chroma_key = this.stringRightRotate(chroma_key,8);
    }

    // check the modulo 12 of each variable. if it's 0, move it up 1 and try again. try 12 times then quit
    let key_sequence = [];
    for (let [k, step] of Object.entries(this.data)) {
      if (step < 0) {
        key_sequence.push(-1);
        continue;
      }
      step = Math.round(step);
      let key_found = false, i = 0;
      while ( key_found == false && i < 12 ) {
        if ( chroma_key[step%12] == 1 ) {
          // in key now
          key_found = true;
          key_sequence.push(step);
          break;
        }
        else {
          // not yet in key
          step += 1;
        }
        i++;
      }
      if ( key_found == false ) {
        key_sequence.push(-1);
      }
    }
    this.key_data = key_string;
    this.data = key_sequence;
    return this;
  }

  append (sequence2) {
    if ( typeof sequence2 == 'number' || Array.isArray(sequence2) === true ) {
      sequence2 = new FacetPattern().from(sequence2);
    }
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    this.data = this.data.concat(sequence2.data);
    return this;
  }

  prepend(sequence2) {
    if ( typeof sequence2 == 'number' || Array.isArray(sequence2) === true ) {
      sequence2 = new FacetPattern().from(sequence2);
    }
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    this.data = [...sequence2.data, ...this.data];
    this.flatten();
    return this;
  }

  at (position, value) {
    let replace_position = Math.round(position * (this.data.length-1));
    this.data[replace_position] = value;
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

  crush(bits, reductionFactor = 1) {
    if (typeof bits == 'number' || Array.isArray(bits) === true) {
        bits = new FacetPattern().from(bits);
    }
    if (typeof reductionFactor == 'number' || Array.isArray(reductionFactor) === true) {
        reductionFactor = new FacetPattern().from(reductionFactor);
    }
    bits.round().abs().replace(0,1).size(this.data.length);
    reductionFactor.round().abs().replace(0,1).size(this.data.length);
    let wave = [];
    let i = 0;
    while (i < this.data.length) {
        let step = Math.pow(2, bits.data[i]);
        let value = Math.round(this.data[i] * step) / step;
        let currentReductionFactor = reductionFactor.data[i];
        for (let j = 0; j < currentReductionFactor; j++) {
            wave[i + j] = value;
        }
        i += currentReductionFactor;
    }
    this.data = wave;
    return this;
}

waveformSample(waveform, phase) {
  switch (waveform) {
      case 0:
          return Math.sin(phase);
      case 1:
          return phase % (2 * Math.PI) < Math.PI ? 1 : -1;
      case 2:
          return 1 - 4 * Math.abs(Math.round(phase / (2 * Math.PI)) - phase / (2 * Math.PI));
      case 3:
          return 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
      default:
        return Math.sin(phase);
  }
}

  gate(threshold, attackSamples, releaseSamples) {
    attackSamples = Math.abs(Math.floor(Number(attackSamples)));
    releaseSamples = Math.abs(Math.floor(Number(releaseSamples)));
    threshold = Math.abs(threshold);
    let gateOn = false;
    let attackCounter = 0;
    let releaseCounter = 0;
    let gatedSignal = this.data.map(sample => {
        if (Math.abs(sample) < threshold && !gateOn) {
            attackCounter++;
            if (attackCounter >= attackSamples) {
                gateOn = true;
                releaseCounter = 0;
            }
        } else if (Math.abs(sample) >= threshold) {
            attackCounter = 0;
        } else if (gateOn && releaseCounter < releaseSamples) {
            releaseCounter++;
        } else if (gateOn && releaseCounter >= releaseSamples) {
            gateOn = false;
        }
        return gateOn ? 0 : sample;
    });
    this.data = gatedSignal;
    return this;
}

  mix ( wet, command) {
    if ( typeof command != 'function' ) {
      throw `2nd argument must be a function, type found: ${typeof command}`;
    }
    command = command.toString();
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    wet = Math.abs(Number(wet));
    let dry = Math.abs(wet-1);
    let dry_data = new FacetPattern().from(this.data).times(dry);
    eval(this.env + this.utils + command);
    let wet_data = new FacetPattern().from(this.data).times(wet);
    let mixed_data = dry_data.sup(wet_data, 0);
    this.data = mixed_data.data;
    return this;
  }

  comb (delaySamples = FACET_SAMPLE_RATE / 100, feedforward = 0.5, feedback = 0.5) {
    feedback = Math.min(Math.max(feedback, 0), 0.98);
    feedforward = Math.min(Math.max(feedforward, 0), 0.98);
    delaySamples = Math.round(Math.abs(Number(delaySamples)));
    let maxFeedbackIterations = Math.ceil(Math.log(0.001) / Math.log(feedback));
    let outputLength = this.data.length + delaySamples * maxFeedbackIterations;
    let output = new Array(outputLength).fill(0);
    for (let i = 0; i < outputLength; i++) {
        let delayedIndex = i - delaySamples;
        let delayedInputSample = delayedIndex < 0 ? 0 : this.data[delayedIndex];
        let delayedOutputSample = delayedIndex < 0 ? 0 : output[delayedIndex];
        if (i < this.data.length) {
            output[i] = feedforward * this.data[i] + 1 * delayedInputSample + feedback * delayedOutputSample;
        } else {
            output[i] = feedback * delayedOutputSample;
        }
    }
    this.data = output;
    return this;
  }

  delay (delayAmount, feedback = 0.5) {
    feedback = Math.min(Math.max(feedback, 0), 0.98);
    delayAmount = Math.round(Math.abs(Number(delayAmount)));
    let maxFeedbackIterations = Math.ceil(Math.log(0.001) / Math.log(feedback));
    let delayedArray = new Array(this.data.length + delayAmount * maxFeedbackIterations).fill(0);
    for (let i = 0; i < maxFeedbackIterations; i++) {
        let gain = Math.pow(feedback, i);
        for (let j = 0; j < this.data.length; j++) {
            delayedArray[j + i * delayAmount] += this.data[j] * gain;
        }
    }
    this.data = delayedArray;
    return this;
  }

  // ratio is a float between 0 and 1 corresponding to n:1 so 0.5 would be 2:1, 0.2 would be 5:1 tc
  // threshold is the sample amplitude at which compression kicks in
  // attacktime and release time are expressed as relations to a second, so 0.1 would be 1/10th of a second
  // 
  compress (ratio, threshold, attackTime, releaseTime) {
    let initial_maximum_value = this.getMaximumValue();
    let attack = Math.pow(0.01, 1.0 / (attackTime * FACET_SAMPLE_RATE));
    let release = Math.pow(0.01, 1.0 / (releaseTime * FACET_SAMPLE_RATE));
    let envelope = 0;
    let gain = 1;
    let compressedAudio = [];
    let maximum_value = Math.max(...this.data);

    for (let i = 0; i < this.data.length; i++) {
        let sample = this.data[i];
        let absSample = Math.abs(sample);

        if (absSample > envelope) {
            envelope *= attack;
            envelope += (1 - attack) * absSample;
        } else {
            envelope *= release;
            envelope += (1 - release) * absSample;
        }

        if (envelope > threshold) {
            gain = threshold / envelope;
        } else {
            gain = 1;
        }

        compressedAudio[i] = sample * gain * ratio;
    }
    this.data = compressedAudio;
    // automatically set gain to match loudest value in original data
    this.full(initial_maximum_value);
    return this;
}
  
  convolve (impulseResponse) {
    if ( !this.isFacetPattern(impulseResponse) ) {
      throw `input must be a FacetPattern object; type found: ${typeof impulseResponse}`;
    }
    // maximum IR size is 1 second; otherwise it quickly becomes way too much computation
    if (impulseResponse.data.length > FACET_SAMPLE_RATE) {
      impulseResponse.size(FACET_SAMPLE_RATE)
    }
    let output = new Array(this.data.length + impulseResponse.data.length - 1).fill(0);
    for (let i = 0; i < this.data.length; i++) {
        for (let j = 0; j < impulseResponse.data.length; j++) {
            output[i + j] += this.data[i] * impulseResponse.data[j];
        }
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

  divide (sequence2, match_sizes = true) {
    if ( typeof sequence2 == 'number' || Array.isArray(sequence2) === true ) {
      sequence2 = new FacetPattern().from(sequence2);
    }
    let out = [];
    if (match_sizes != false) {
      let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
      for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
        out[key] = same_size_arrays[0].data[key] / same_size_arrays[1].data[key];
      }
    }
    else {
      if (this.data.length >= sequence2.data.length) {
        for (const [key, step] of Object.entries(this.data)) {
          if (isNaN(sequence2.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step / sequence2.data[key];
          }
        }
      }
      else {
        for (const [key, step] of Object.entries(sequence2.data)) {
          if (isNaN(this.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step / this.data[key];
          }
        }
      }
    }
    this.data = out;
    this.fixnan();
    return this;
  }

  dup (num) {
    this.data = Array.from({length: Number(num+1)}).flatMap(a => this.data)
    this.flatten();
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
    let next_copy = new FacetPattern().from(this.data);
    for (var x = 0; x < num; x++) {
      next_copy.times(feedback)
      this.flatten().append(next_copy);
    }
    this.flatten();
    return this;
  }

  equals (sequence2, match_sizes = true) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    if (match_sizes != false) {
      let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
      for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
        out[key] = (same_size_arrays[0].data[key] == same_size_arrays[1].data[key]);
      }
    }
    else {
      if (this.data.length >= sequence2.data.length) {
        for (const [key, step] of Object.entries(this.data)) {
          if (isNaN(sequence2.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step == sequence2.data[key];
          }
        }
      }
      else {
        for (const [key, step] of Object.entries(sequence2.data)) {
          if (isNaN(this.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step == this.data[key];
          }
        }
      }
    }
    this.data = out.map(bool => bool ? 1 : 0);
    return this;
  }

  fft () {
    this.reduce(this.prevPowerOf2(this.data.length));
    let f = new FFT(this.data.length);
    let out = f.createComplexArray();
    f.realTransform(out, this.data);
    this.data = f.fromComplexArray(out);
    return this;
  }

  flipabove (maximum) {
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

  flipbelow (min) {
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

  follow (attackTime = FACET_SAMPLE_RATE / 0.1, releaseTime = FACET_SAMPLE_RATE / 4) {
    let envelope = [];
    let attack = Math.exp(-1 / attackTime);
    let release = Math.exp(-1 / releaseTime);
    let currentEnvelope = 0;
    for (let i = 0; i < this.data.length; i++) {
        let input = Math.abs(this.data[i]);
        if (input > currentEnvelope) {
            currentEnvelope = attack * currentEnvelope + (1 - attack) * input;
        } else {
            currentEnvelope = release * currentEnvelope + (1 - release) * input;
        }
        envelope.push(currentEnvelope);
    }
    this.data = envelope;
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
    this.data = sequence.times(1 - amt).add(mult_sequence.times(amt)).data;
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

  logslider(position) {
  var minp = 0;
  var maxp = 1;
  var minv = Math.log(0.1);
  var maxv = Math.log(1000);
  var scale = (maxv-minv) / (maxp-minp);
  return Math.exp(minv + scale*(position-minp));
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

  allpass(frequency = FACET_SAMPLE_RATE / 2) {
    let outputArray = [];
    let a = (Math.tan(Math.PI * frequency / FACET_SAMPLE_RATE) - 1) / (Math.tan(Math.PI * frequency / FACET_SAMPLE_RATE) + 1);
    for (let i = 0; i < this.data.length; i++) {
        let x = this.data[i];
        let y;
        if (i === 0) {
            y = -a * x;
        } else {
            y = -a * x + this.data[i - 1] + a * outputArray[i - 1];
        }
        outputArray.push(y);
    }
    this.data = outputArray;
    return this;
  }

  trim () {
    let dbArr = this.data.map(x => 20 * Math.log10(Math.abs(x)));
    let end = dbArr.length - 1;
    while (dbArr[end] < -70) {
        end--;
    }
    this.data = this.data.slice(0, end + 1);
    return this;
  }

  resonate (baseFrequency, coefficients, q = 80, wet = 1) {
    let initial_maximum_value = this.getMaximumValue();
    baseFrequency = Math.abs(Number(baseFrequency));
    q = Math.abs(Number(q));
    wet = Math.abs(Number(wet));
    let tail_fp = new FacetPattern().from(this.data).reverb(0.3).times(new FacetPattern().from(this.data).times(0),false);
    this.sup(tail_fp,0);
    if (wet > 1 ) {
      wet = 1;
    }
    if ( !this.isFacetPattern(coefficients) ) {
      throw `input must be a FacetPattern object; type found: ${typeof coefficients}`;
    }
    let out_fp = new FacetPattern();
    for (var i = 0; i < coefficients.data.length; i++) {
      out_fp.sup(new FacetPattern().from(this.data).bpf(baseFrequency*coefficients.data[i],q),0);
    }
    let dry = Math.abs(1 - wet);
    this.times(dry);
    out_fp.times(wet);
    this.sup(out_fp,0);
    this.full(initial_maximum_value);
    this.fadeout(0.2);
    return this;
  }

  harmonics(num_harmonics) {
    if (typeof num_harmonics == 'number' || Array.isArray(num_harmonics) === true) {
        num_harmonics = new FacetPattern().from(num_harmonics);
    }
    num_harmonics.size(this.data.length);
    let initial_maximum_value = this.getMaximumValue();
    let result = [];
    for (let i = 0; i < this.data.length; i++) {
        let harmonicSum = 0;
        let num_harmonicsIndex = Math.floor((i / this.data.length) * num_harmonics.data.length);
        let numHarmonics = Math.abs(Math.floor(Number(num_harmonics.data[num_harmonicsIndex])));
        for (let j = 1; j <= numHarmonics; j++) {
            harmonicSum += Math.sin(j * this.data[i]) + Math.cos(j * this.data[i]);
        }
        result.push(this.data[i] + harmonicSum);
    }
    this.data = result;
    this.full(initial_maximum_value);
    this.audio();
    return this;
  }

  lpf (cutoffPattern, q = 2.5) {
    if ( typeof cutoffPattern == 'number' || Array.isArray(cutoffPattern) === true ) {
      cutoffPattern = new FacetPattern().from(cutoffPattern);
    }
    // scale up cutoffPattern to match the size of this.data
    cutoffPattern.size(this.data.length);
    // apply a low-pass filter to this.data
    // using the values in cutoffPattern as the cutoff values
    this.data = this.lpfInner(this.data, cutoffPattern.data,q);
    this.fixnan();
    return this;
  }

  // runs per-sample LPF for lpmod
  lpfInner(data, cutoffs, q) {
    let filteredData = [];
    let prevValue1 = data[0];
    let prevValue2 = data[0];
    let a0, a1, a2, b1, b2;
    for (let i = 0; i < data.length; i++) {
        let w0 = 2 * Math.PI * cutoffs[i] / FACET_SAMPLE_RATE;
        let alpha = Math.sin(w0) / (2 * q);
        a0 = 1 + alpha;
        a1 = -2 * Math.cos(w0);
        a2 = 1 - alpha;
        b1 = (1 - Math.cos(w0)) / 2;
        b2 = 1 - Math.cos(w0);
        if (i < 2) {
            filteredData[i] = data[i];
        } else {
            filteredData[i] = (b1 * data[i] + b2 * prevValue1 + b1 * prevValue2 - a1 * filteredData[i-1] - a2 * filteredData[i-2]) / a0;
        }
        prevValue2 = prevValue1;
        prevValue1 = data[i];
    }
    return filteredData;
  }

  hpf(cutoffPattern, q = 2.5) {
    if (typeof cutoffPattern == 'number' || Array.isArray(cutoffPattern) === true) {
        cutoffPattern = new FacetPattern().from(cutoffPattern);
    }
    // scale up cutoffPattern to match the size of this.data
    cutoffPattern.size(this.data.length);
    // apply a high-pass filter to this.data
    // using the values in cutoffPattern as the cutoff values
    this.data = this.hpfInner(this.data, cutoffPattern.data, q);
    this.fixnan();
    return this;
  }

  // runs per-sample HPF for hpmod
  hpfInner(data, cutoffs, q) {
    let filteredData = [];
    let prevValue1 = data[0];
    let prevValue2 = data[0];
    let a0, a1, a2, b1, b2;
    for (let i = 0; i < data.length; i++) {
      let w0 = 2 * Math.PI * cutoffs[i] / FACET_SAMPLE_RATE;
      let alpha = Math.sin(w0) / (2 * q);
      a0 = 1 + alpha;
      a1 = -2 * Math.cos(w0);
      a2 = 1 - alpha;
      b1 = (1 + Math.cos(w0)) / 2;
      b2 = -(1 + Math.cos(w0));
      if (i < 2) {
          filteredData[i] = data[i];
      } else {
          filteredData[i] = (b1 * data[i] + b2 * prevValue1 + b1 * prevValue2 - a1 * filteredData[i-1] - a2 * filteredData[i-2]) / a0;
      }
      prevValue2 = prevValue1;
      prevValue1 = data[i];
    }
    return filteredData;
  }

  bpf(cutoffPattern, q = 2.5) {
    if (typeof cutoffPattern == 'number' || Array.isArray(cutoffPattern) === true) {
        cutoffPattern = new FacetPattern().from(cutoffPattern);
    }
    // scale up cutoffPattern to match the size of this.data
    cutoffPattern.size(this.data.length);
    // apply a band-pass filter to this.data
    // using the values in cutoffPattern as the cutoff values
    this.data = this.bpfInner(this.data, cutoffPattern.data, q);
    this.fixnan();
    return this;
  }

  // runs per-sample BPF for bpmod
  bpfInner(data, cutoffs, q) {
    let filteredData = [];
    let prevValue1 = data[0];
    let prevValue2 = data[0];
    let a0, a1, a2, b1;
    for (let i = 0; i < data.length; i++) {
        let w0 = 2 * Math.PI * cutoffs[i] / FACET_SAMPLE_RATE;
        let alpha = Math.sin(w0) / (2 * q);
        a0 = 1 + alpha;
        a1 = -2 * Math.cos(w0);
        a2 = 1 - alpha;
        b1 = alpha;
        if (i < 2) {
            filteredData[i] = data[i];
        } else {
            filteredData[i] = (b1 * data[i] - b1 * prevValue2 - a1 * filteredData[i-1] - a2 * filteredData[i-2]) / a0;
        }
        prevValue2 = prevValue1;
        prevValue1 = data[i];
    }
    return filteredData;
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
    // scale the data so it's in the range of the new_values
    this.scale(Math.min.apply(Math, fp.data),Math.max.apply(Math, fp.data));
    // safeguard against mapping more than 1 second's worth samples to another pattern.
    this.reduce(FACET_SAMPLE_RATE);
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
    let lastNonZero = this.data[this.data.length - 1];
    let changed = false;
    for (let i = 0; i < this.data.length; i++) {
        if (this.data[i] === 0) {
          this.data[i] = lastNonZero;
            changed = true;
        } else {
            lastNonZero = this.data[i];
        }
    }
    if (changed && lastNonZero !== 0) {
        this.nonzero(this.data);
    }
    return this;
  }

  or ( sequence2, match_sizes = true ) {
    if ( !this.isFacetPattern(sequence2) ) {
      throw `input must be a FacetPattern object; type found: ${typeof sequence2}`;
    }
    let out = [];
    if (match_sizes != false) {
      let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
      for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
        out[key] = (same_size_arrays[0].data[key] != 0 || same_size_arrays[1].data[key] != 0);
      }
    }
    else {
      if (this.data.length >= sequence2.data.length) {
        for (const [key, step] of Object.entries(this.data)) {
          if (isNaN(sequence2.data[key])) {
            out[key] = (step != 0);
          }
          else {
            out[key] = (step != 0) || (sequence2.data[key] != 0);
          }
        }
      }
      else {
        for (const [key, step] of Object.entries(sequence2.data)) {
          if (isNaN(this.data[key])) {
            out[key] = (step != 0);
          }
          else {
            out[key] = (step != 0) || (this.data[key] != 0);
          }
        }
      }
    }
    this.data = out.map(bool => bool ? 1 : 0);
    return this;
  }

  palindrome () {
    this.data = this.data.concat(this.reverse().data);
    return this;
  }

  wrap (min, max) {
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
      throw `Cannot run wrap with equal min and max: ${min}`;
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

  replace ( original_value, new_value ) {
    original_value = Number(original_value);
    new_value = Number(new_value);
    let replaced_sequence = [];
    for (const [key, step] of Object.entries(this.data)) {
      if (step === original_value) {
        replaced_sequence[key] = new_value;
      }
      else {
        replaced_sequence[key] = step;
      }
    }
    this.data = replaced_sequence;
    return this;
  }

  reverb (size) {
    if ( size > 1) {
      size = 1;
    }
    if (size <= 0) {
      size = 0.01;
    }
    let silence_at_end = new FacetPattern().silence(FACET_SAMPLE_RATE*10);
    this.append(silence_at_end);
    this.data = new Freeverb(size).process(this.data,size);
    this.flatten().trim();
    return this;
  }

  pitch(pitchShiftFactors) {
    if (typeof pitchShiftFactors == 'number' || Array.isArray(pitchShiftFactors) === true) {
        pitchShiftFactors = new FacetPattern().from(pitchShiftFactors);
    }
    pitchShiftFactors.size(this.data.length);
    let windowSize = 1024;
    let hopSize = windowSize / 4;
    let outputArray = [];
    let window = this.hannWindow(windowSize);
    for (let i = 0; i < this.data.length; i += hopSize) {
        let segment = this.data.slice(i, i + windowSize);
        if (segment.length < windowSize) {
            let padding = new Array(windowSize - segment.length).fill(0);
            segment = segment.concat(padding);
        }
        for (let j = 0; j < segment.length; j++) {
            segment[j] *= window[j];
        }
        let pitchShiftFactorIndex = Math.floor((i / this.data.length) * pitchShiftFactors.data.length);
        let pitchShiftFactor = Math.abs(Number(pitchShiftFactors.data[pitchShiftFactorIndex]));
        if (pitchShiftFactor == 0) {
            pitchShiftFactor = 0.125;
        }
        let resampledSegment = this.resample(segment, 1 / pitchShiftFactor);
        for (let j = 0; j < resampledSegment.length; j++) {
            let outputIndex = i + j;
            if (outputIndex < outputArray.length) {
                outputArray[outputIndex] += resampledSegment[j];
            } else {
                outputArray.push(resampledSegment[j]);
            }
        }
    }
    this.data = outputArray;
    return this;
}

  hannWindow (size) {
      let window = [];
      for (let i = 0; i < size; i++) {
          window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
      }
      return window;
  }

  resample (array, factor) {
      let outputArray = [];
      for (let i = 0; i < array.length * factor; i++) {
          let index = i / factor;
          let indexFloor = Math.floor(index);
          let indexCeil = Math.ceil(index);
          if (indexCeil >= array.length) {
              indexCeil = array.length - 1;
          }
          let value = array[indexFloor] + (index - indexFloor) * (array[indexCeil] - array[indexFloor]);
          outputArray.push(value);
      }
      return outputArray;
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

  tanh(gains = 20) {
    if (typeof gains == 'number' || Array.isArray(gains) === true) {
        gains = new FacetPattern().from(gains);
    }
    gains.size(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
        let gainIndex = Math.floor((i / this.data.length) * gains.data.length);
        let gain = Number(gains.data[gainIndex]);
        this.data[i] = Math.tanh(this.data[i] * gain);
    }
    return this;
  }

  scale (new_min, new_max) {
    if (this.data.length === 1) {
        if (this.data[0] < new_min) {
          // if only a single value is in the data, and it's below new_min, output new_min
          this.data = [new_min];
        }
        else if (this.data[0] > new_max) {
          // if only a single value is in the data, and it's above new_max, output new_max
          this.data = [new_max];
        }
        // do nothing if the data is already in the range of new_min and new_max
        return this;
    }
    const min = Math.min(...this.data);
    const max = Math.max(...this.data);
    const scaledData = this.data.map(value => ((value - min) / (max - min)) * (new_max - new_min) + new_min);
    this.data = scaledData;
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

  sieve (modulatorData) {
    // scale modulator data to be the same length as input data. whichever is larger is what the other is scaled to
    if (modulatorData.data.length > this.data.length ) {
      this.stretchto(modulatorData.data.length);
    }
    else {
      modulatorData.size(this.data.length);
    }
    // clip modulator data to be within 0 and 1
    let clippedModulatorData = modulatorData.data.map(x => Math.max(0, Math.min(1, x)));
    // Use modulator data as a lookup table
    let output = new Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
        output[i] = this.data[Math.round(clippedModulatorData[i] * (this.data.length - 1))];
    }
    this.data = output;
    this.flatten();
    return this;
  }

  slew (depth = 25, up_speed = 1, down_speed = 1) {
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
   ratio = Math.abs(Number(ratio));
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

  flange (delaySamples = 220, depth = 110) {
    const output = [];
    for (let i = 0; i < this.data.length; i++) {
      const delay = Math.sin(i / this.data.length * Math.PI * 2) * depth + delaySamples;
      const delayIndex = i - Math.floor(delay);
      if (delayIndex < 0) {
        output[i] = this.data[i];
      } else {
        output[i] = (this.data[i] + this.data[delayIndex]) / 2;
      }
    }
    this.data = output;
    return this;
  }

  size (new_size) {
    new_size = Math.round(Math.abs(Number(new_size)));
    // get ratio between current size and new size
    let change_ratio = new_size / this.data.length;
    this.speed(change_ratio);
    return this;
  }

  stretch(stretchFactors) {
    if (typeof stretchFactors == 'number' || Array.isArray(stretchFactors) === true) {
        stretchFactors = new FacetPattern().from(stretchFactors);
    }
    stretchFactors.size(this.data.length);
    let outputArray = [];
    let chunkSize = Math.round(FACET_SAMPLE_RATE / 128);
    let skip_every = 0;
    for (let i = 0; i < this.data.length; i += chunkSize) {
        let chunk = this.data.slice(i, i + chunkSize);
        let stretchFactorIndex = Math.floor((i / this.data.length) * stretchFactors.data.length);
        let stretchFactor = Number(stretchFactors.data[stretchFactorIndex]);
        if (stretchFactor >= 1) {
            for (let j = 0; j < stretchFactor; j++) {
                outputArray.push(chunk);
            }
        } else {
            let skipFactor = Math.round(1 / stretchFactor);
            if (skip_every % skipFactor === 0) {
                outputArray.push(chunk);
            }
        }
        skip_every++;
    }
    this.data = outputArray;
    this.data = this.fadeArrays(this.data);
    this.data = this.sliceEndFade(this.data);
    this.flatten();
    return this;
  }

  stretchto(samps) {
    let stretchFactor = samps / this.data.length;
    this.stretch(stretchFactor);
    this.reduce(samps);
    return this;
  }

  full (new_maximum = 1) {
    let maxVal = 0;
    for (let i = 0; i < this.data.length; i++) {
      maxVal = Math.max(maxVal, Math.abs(this.data[i]));
    }
    let gain = new_maximum / maxVal;
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] *= gain;
    }
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

  stutter (repeats, start_pos = 0, end_pos = 1) {
    repeats = Math.abs(Math.round(Number(repeats)));
    if ( repeats < 1 ) {
      return this;
    }
    start_pos = Math.abs(Number(start_pos));
    if ( start_pos > 1 ) {
      throw `stutter start_pos value must be between 0 and 1, value found: ${start_pos}`;
    }
    end_pos = Math.abs(Number(end_pos));
    if ( end_pos > 1 ) {
      throw `stutter end_pos value must be between 0 and 1, value found: ${end_pos}`;
    }
    let original_length = this.data.length;
    let stutter_fp = new FacetPattern().from(this.range(start_pos,end_pos).data).speed(1/repeats).dup(repeats-1).size(original_length);
    this.data = stutter_fp.data;
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

  subtract (sequence2, match_sizes = true) {
    if ( typeof sequence2 == 'number' || Array.isArray(sequence2) === true ) {
      sequence2 = new FacetPattern().from(sequence2);
    }
    let out = [];
    if (match_sizes != false) {
      let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
      for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
        out[key] = (same_size_arrays[0].data[key] - same_size_arrays[1].data[key]);
      }
    }
    else {
      if (this.data.length >= sequence2.data.length) {
        for (const [key, step] of Object.entries(this.data)) {
          if (isNaN(sequence2.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step - sequence2.data[key];
          }
        }
      }
      else {
        for (const [key, step] of Object.entries(sequence2.data)) {
          if (isNaN(this.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step - this.data[key];
          }
        }
      }
    }
    this.data = out;
    this.fixnan();
    return this;
  }

  times (sequence2, match_sizes = true) {
    if ( typeof sequence2 == 'number' || Array.isArray(sequence2) === true ) {
      sequence2 = new FacetPattern().from(sequence2);
    }
    let out = [];
    if (match_sizes != false) {
      let same_size_arrays = this.makePatternsTheSameSize(this, sequence2);
      for (const [key, step] of Object.entries(same_size_arrays[0].data)) {
        out[key] = (same_size_arrays[0].data[key] * same_size_arrays[1].data[key]);
      }
    }
    else {
      if (this.data.length >= sequence2.data.length) {
        for (const [key, step] of Object.entries(this.data)) {
          if (isNaN(sequence2.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step * sequence2.data[key];
          }
        }
      }
      else {
        for (const [key, step] of Object.entries(sequence2.data)) {
          if (isNaN(this.data[key])) {
            out[key] = 0;
          }
          else {
            out[key] = step * this.data[key];
          }
        }
      }
    }
    this.data = out;
    this.fixnan();
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
    base = this.logslider(base);
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
  fade (fade_percent = 0.1) {
    this.fadein(fade_percent).fadeout(fade_percent);
    return this;
  }

  fadein(fade_amount) {
    let fade_length = Math.floor(this.data.length * fade_amount);
    for (let i = 0; i < fade_length; i++) {
        this.data[i] = this.data[i] * Math.sin((i / fade_length) * (Math.PI / 2));
    }
    for (let i = 0; i < fade_length; i++) {
      this.data[i] = this.data[i] * Math.sin((i / fade_length) * (Math.PI / 2));
    }
    return this;
  }

  fadeout(fade_amount) {
    let fade_length = Math.floor(this.data.length * fade_amount);
    for (let i = this.data.length - 1; i >= this.data.length - fade_length; i--) {
        this.data[i] = this.data[i] * Math.sin(((this.data.length - i) / fade_length) * (Math.PI / 2));
    }
    for (let i = this.data.length - 1; i >= this.data.length - fade_length; i--) {
      this.data[i] = this.data[i] * Math.sin(((this.data.length - i) / fade_length) * (Math.PI / 2));
  }
    return this;
  }

  fadeoutSamples(fade_samples) {
    let fade_length = fade_samples;
    for (let j = 0; j < 20; j++) {
        for (let i = this.data.length - 1; i >= this.data.length - fade_length; i--) {
            this.data[i] = this.data[i] * Math.sin(((this.data.length - i) / fade_length) * (Math.PI / 2));
        }
    }
    return this;
  }
  // END WINDOW operations. shimmed from https://github.com/scijs/window-function

  // BEGIN audio operations
  audio () {
    this.hpf(5);
    return this;
  }

  channels (chans) {
    this.dacs = '';
    let output_channel_str = '';
    if ( typeof chans == 'number' ) {
      chans = [chans];
    }
    else if ( this.isFacetPattern(chans) ) {
      chans = chans.data;
    }
    for (var i = 0; i < Math.max(...chans); i++) {
      if ( chans.includes(i+1) ) {
        this.dacs += '1 ';
      }
      else {
        this.dacs += '0 ';
      }
    }
    // remove last space
    this.dacs = this.dacs.slice(0, -1);
    return this;
  }

  // semantically useful if you forget when running with one channel
  channel (chans) {
    this.channels(chans);
    return this;
  }

  ichunk (lookupPattern) {
    if ( !this.isFacetPattern(lookupPattern) ) {
      throw `input must be a FacetPattern object; type found: ${typeof lookupPattern}`;
    }
    let outputArray = [];
    let chunkSize = Math.round(this.data.length / lookupPattern.data.length);
    for (let i = 0; i < lookupPattern.data.length; i++) {
        let chunkIndex = Math.floor(lookupPattern.data[i] * (lookupPattern.data.length-1));
        let chunkStart = chunkIndex * chunkSize;
        let chunkEnd = chunkStart + chunkSize;
        let chunk = this.data.slice(chunkStart, chunkEnd);
        outputArray.push(chunk);
    }
    this.data = outputArray;
    this.data = this.fadeArrays(this.data);
    this.data = this.sliceEndFade(this.data);
    this.flatten();
    return this;
  }

  mutechunks (numChunks = 16, probability = 0.75) {
    // Break the array into numChunks chunks
    let chunkSize = Math.ceil(this.data.length / numChunks);
    let chunks = [];
    for (let i = 0; i < this.data.length; i += chunkSize) {
        chunks.push(this.data.slice(i, i + chunkSize));
    }
    // Set some of the chunks to 0 based on the probability coefficient
    for (let chunk of chunks) {
        if (Math.random() < probability) {
            for (let i = 0; i < chunk.length; i++) {
                chunk[i] = 0;
            }
        }
    }
    // Stitch the 1D array back together
    let result = [];
    for (let chunk of chunks) {
        result.push(chunk);
    }
    this.data = result;
    this.data = this.fadeArrays(this.data);
    this.data = this.sliceEndFade(this.data);
    this.flatten();
    return this;
}

  rechunk (numChunks) {
    // Break the array into numChunks chunks
    let chunkSize = Math.ceil(this.data.length / numChunks);
    let chunks = [];
    for (let i = 0; i < this.data.length; i += chunkSize) {
        chunks.push(this.data.slice(i, i + chunkSize));
    }

    // Shuffle the chunks
    for (let i = chunks.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }

    // Stitch the 1D array back together
    let result = [];
    for (let chunk of chunks) {
        result.push(chunk);
    }
    this.data = result;
    this.data = this.fadeArrays(this.data);
    this.data = this.sliceEndFade(this.data);
    this.flatten();
    return this;
}
  // END audio operations

  // BEGIN special operations
  bpm () {
    this.bpm_pattern = new FacetPattern().from(this.data);
    return this;
  }

  cc (controller = 70, channel = 1) {
    if ( typeof controller != 'number' ) {
      throw `.cc() 1st argument: controller must be a number; type found: ${typeof controller}`;
    }
    if ( typeof channel != 'number' ) {
      throw `.cc() 2nd argument: channel must be a number; type found: ${typeof channel}`;
    }
    this.scale(Math.min(...this.data)*127,Math.max(...this.data) * 127);
    this.cc_data = {
      data:this.data,
      controller:controller,
      channel:channel
    };
    return this;
  }

  chord (chord_name, inversion_mode = 0) {
    const VALID_CHORD_NAMES = [
      'maj', 'major',
      'min', 'minor',
      'fifth', '5th', '5',
      'seventh', '7th', '7',
      'major seventh', 'maj7',
      'minor seventh', 'm7',
      'diminished', 'dim',
      'add2', 'add9'
    ];
    if ( !VALID_CHORD_NAMES.includes(chord_name) ) {
      throw `invalid chord name: ${chord_name}`;
    }

    let chord_intervals_to_add = [];
    switch (chord_name) {
      case 'maj':
        chord_intervals_to_add = [4,7];
      case 'major':
        chord_intervals_to_add = [4,7];
      case 'min':
            chord_intervals_to_add = [3,7];
      case 'minor':
          chord_intervals_to_add = [3,7];
      case 'fifth':
          chord_intervals_to_add = [7];
      case '5th':
          chord_intervals_to_add = [7];
      case 'seventh':
          chord_intervals_to_add = [4,7,10];
      case '7th':
          chord_intervals_to_add = [4,7,10];
      case 'major seventh':
        chord_intervals_to_add = [4,7,11];
      case 'maj7':
        chord_intervals_to_add = [4,7,11];
      case 'minor seventh':
        chord_intervals_to_add = [3,7,10];
      case 'm7':
        chord_intervals_to_add = [3,7,10];
      case 'diminished':
        chord_intervals_to_add = [-1,2,5];
      case 'dim':
        chord_intervals_to_add = [-1,2,5];
      case 'add2':
        chord_intervals_to_add = [2,4,7];
      case 'add9':
        chord_intervals_to_add = [4,7,14];
        break;
      default:
    }

    if ( inversion_mode == 1 ) {
      chord_intervals_to_add[0] -= 12;
    }
    else if ( inversion_mode == 2 ) {
      chord_intervals_to_add[0] -= 12;
      chord_intervals_to_add[1] -= 12;
    }
    else if ( inversion_mode == 3 ) {
      chord_intervals_to_add[0] -= 12;
      chord_intervals_to_add[1] -= 12;
      chord_intervals_to_add[2] -= 12;
    }

    this.chord_intervals = chord_intervals_to_add;
    return this;
  }

  every (n_loops = 1) {
    this.regenerate_every_n_loops = Math.abs(Math.round(n_loops)) == 0 ? 1 : Math.abs(Math.round(n_loops));
    return this;
  }
  
  parallel (commands) {
    if ( typeof commands != 'object' && Array.isArray(commands) == false ) {
      throw `input to parallel() must be an array of functions, type found: ${typeof commands}`;
    }
    let initial_maximum_value = this.getMaximumValue();
    let out_fp = new FacetPattern();
    let initial_fp = new FacetPattern().from(this.data);
    for (let [key, command] of Object.entries(commands)) {
      this.data = initial_fp.data;
      command = command.toString();
      command = command.replace(/current_slice./g, 'this.');
      command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
      eval(this.env + this.utils + command);
      out_fp.sup(this,0);
    }
    this.data = out_fp.data;
    this.fixnan();
    this.full(initial_maximum_value);
    return this;
  }

  iter (iters, command, prob = 1) {
    prob = Math.abs(Number(prob));
    iters = Math.abs(Math.round(Number(iters)));
    if ( iters == 0 ) {
      return this;
    }
    if ( typeof command != 'function' ) {
      throw `3rd argument to .iter() must be a function, type found: ${typeof command}`;
    }
    command = command.toString();
    command = command.replace(/current_slice./g, 'this.');
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    for (var i = 0; i < iters; i++) {
      if ( Math.random() < prob ) {
        eval(this.env + this.utils + command);
      }
    }
    return this;
  }

  keep () {
    this.do_not_regenerate = true;
    return this;
  }

  note (velocity = new FacetPattern().from(100), duration = new FacetPattern().from(125), channel = 1) {
    if ( typeof velocity == 'number' || Array.isArray(velocity) === true ) {
      velocity = new FacetPattern().from(velocity);
    }
    if ( typeof duration == 'number' || Array.isArray(duration) === true ) {
      duration = new FacetPattern().from(duration);
    }
    if ( typeof channel != 'number' ) {
      throw `3rd argument to .note(): channel must be a number; type found: ${typeof channel}`;
    }
    velocity.size(this.data.length);
    duration.size(this.data.length);
    for (const [key, step] of Object.entries(this.data)) {
      this.notes.push({
        note:step,
        velocity:velocity.data[key],
        duration:duration.data[key],
        channel:channel
      });
    }
    return this;
  }

  once () {
    this.play_once = true;
    this.do_not_regenerate = true;
    return this;
  }

  osc ( address ) {
    if ( address.charAt(0) !== '/' ) {
      throw `invalid OSC address: ${address}. All OSC commands must have an address starting with the / character.`;
    }
    this.osc_data = {
      data:this.data,
      address:address
    };
    return this;
  }

  pitchbend (channel = 1) {
    if ( typeof channel != 'number' ) {
      throw `1st argument to .pitchbend(): channel must be a number; type found: ${typeof channel}`;
    }
    this.scale(-1,1);
    this.pitchbend_data = {
      data:this.data,
      channel:channel
    };
    return this;
  }

  play (sequence = 0 ) {
    if ( typeof this.name == 'number')   {
      throw `FacetPattern found without a name. All FacetPatterns for audio and MIDI output must be initialized via: $('name_here')`;
    }
    if ( typeof sequence == 'number' ) {
      sequence = [sequence];
    }
    else if ( this.isFacetPattern(sequence) ) {
      sequence = sequence.data;
    }
    if ( Array.isArray(sequence) === false ) {
      throw `input to .play() must be an array or number; type found: ${typeof sequence}`;
    }
    Object.values(sequence).forEach(s => {
      this.sequence_data.push(s);
    });
    return this;
  }

  saveas (filename) {
    let folder = 'samples';
    if (filename.includes(cross_platform_slash)) {
      folder += `${cross_platform_slash}${filename.split(cross_platform_slash)[0]}`;
      filename = filename.split(cross_platform_slash)[1];
    }
    if (!fs.existsSync(folder)) {
      fs.mkdir(folder, { recursive: true }, (err) => {
          if (err) throw err;
      });
    }
    let a_wav = new WaveFile();
    a_wav.fromScratch(1, FACET_SAMPLE_RATE, '32f', this.data);
    fs.writeFileSync(`${folder}/${filename}.wav`, a_wav.toBuffer(),(err) => {});
    return this;
  }

  set (filename) {
    let a_wav = new WaveFile();
    a_wav.fromScratch(1, FACET_SAMPLE_RATE, '32f', this.data);
    fs.writeFileSync(`tmp${cross_platform_slash}${filename}.wav`, a_wav.toBuffer(),(err) => {});
    return this;
  }

  get (filename) {
    try {
      this.sample(`tmp${cross_platform_slash}${filename}.wav`);
    }
    catch (e) {
      try {
        this.sample(`tmp${cross_platform_slash}${filename}.wav`);
      }
      catch (er) {
        try {
          this.sample(`tmp${cross_platform_slash}${filename}.wav`);
        }
        catch (err) {
          throw err;
        }
      }
    }
    return this;
  }

  slices (num_slices, command, prob = 1) {
    let out = [];
    let out_fp = new FacetPattern();
    prob = Math.abs(Number(prob));
    num_slices = Math.abs(Math.round(Number(num_slices)));
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
    for (var s = 0; s < num_slices; s++) {
      slice_start_pos = s * calc_slice_size;
      slice_end_pos = slice_start_pos + calc_slice_size;
      current_slice = new FacetPattern().from(this.data).range(slice_start_pos/this.data.length, slice_end_pos/this.data.length);
      if ( Math.random() < prob ) {
        current_slice = eval(this.utils + command);
      }
      out_fp.sup(current_slice.fadeout(0.01),s/num_slices,this.data.length);
    }
    this.data = out_fp.data;
    this.flatten();
    return this;
  }

  sometimes (prob, command) {
    if ( typeof command != 'function' ) {
      throw `2nd argument must be a function, type found: ${typeof command}`;
    }
    command = command.toString();
    command = command.replace(/current_slice./g, 'this.');
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    prob = Math.abs(Number(prob));
    if ( Math.random() < prob ) {
      eval(this.utils + command);
    }
    return this;
  }
  // END special operations

  // BEGIN utility functions used in other methods
  getMaximumValue () {
    let max = Math.max.apply(Math, this.data);
    let min = Math.abs(Math.min.apply(Math, this.data));
    return max > min ? max : min;
  }

  sliceEndFade(array) {
    // since this is to smooth clicks in audio data, don't crossfade any "data" patterns with <= 1024 values
    let totalLength = 0;
    for (let i = 0; i < array.length; i++) {
      totalLength += array[i].length;
    }
    if ( totalLength <= 1024 ) {
      return array;
    }
    let result = [...array];
    let fadeLength = Math.floor(0.002 * FACET_SAMPLE_RATE);
    for (let i = array.length - fadeLength; i < array.length; i++) {
      let t = (i - (array.length - fadeLength)) / fadeLength;
      result[i] = array[i] * (1 - t);
      if (isNaN(result[i])) {
        result[i] = 0;
      }
    }
    return result;
  }

  fixnan () {
    for (var i = 0; i < this.data.length; i++) {
      if (isNaN(this.data[i])) {
        this.data[i] = 0;
      }
    }
    return this;
  }

  fadeArrays (arrays) {
    // since this is to smooth clicks in audio data, don't crossfade any "data" patterns with <= 1024 values
    let totalLength = 0;
    for (let i = 0; i < arrays.length; i++) {
      totalLength += arrays[i].length;
    }
    if ( totalLength <= 1024 ) {
      return arrays;
    }
    let result = [];
    let fadeLength = Math.floor(0.002 * FACET_SAMPLE_RATE);
    for (let i = 0; i < arrays.length; i++) {
      result.push(...arrays[i].slice(0, -fadeLength));
      if (i < arrays.length - 1) {
        let startValue = arrays[i][arrays[i].length - fadeLength - 1];
        let endValue = arrays[i + 1][0];
        for (let j = 0; j < fadeLength; j++) {
          let t = j / fadeLength;
          let value = startValue + t * (endValue - startValue);
          if (isNaN(value)) {
            value = 0;
          }
          result.push(value);
        }
      } else {
        result.push(...arrays[i].slice(-fadeLength));
      }
    }
    return result;
  }

  convertSamplesToSeconds(samps) {
    return (Math.round((samps / FACET_SAMPLE_RATE) * 1000) / 1000);
  }

  scale1D (arr, n) {
    for (var i = arr.length *= n; i;)
      arr[--i] = arr[i / n | 0]
  }

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

  getEnv() {
    return fs.readFileSync('js/env.js', 'utf8', (err, data) => {
      return data;
    });
  }

  getUtils() {
    return fs.readFileSync('js/utils.js', 'utf8', (err, data) => {
      return data;
    });
  }

  stringLeftRotate(str, d) {
    return str.substring(d, str.length) + str.substring(0, d);
  }


  stringRightRotate(str, d) {
    return this.stringLeftRotate(str, str.length - d);
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

  loadBuffer (in_buffer) {
    let out_buffer;
    let num_samples_to_add = Buffer.byteLength(in_buffer) % 4;
    let new_buff_str = '';
    for ( var i = 0; i < num_samples_to_add; i++ ) {
      new_buff_str += '0';
    }
    let new_buff = Buffer.from(new_buff_str)
    out_buffer = Buffer.concat([in_buffer,new_buff]);
    let decodedAudio = wav.decode(out_buffer);
    if ( decodedAudio.sampleRate != FACET_SAMPLE_RATE ) {
      // adjust for sample rate
      return new FacetPattern().from(decodedAudio.channelData[0]).speed(FACET_SAMPLE_RATE/decodedAudio.sampleRate).data;
    }
    else {
      // no adjustment needed
      return new FacetPattern().from(decodedAudio.channelData[0]).data;
    }
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

  // END utility functions

  // frequency: hz. duration: samples (converted to seconds internally). damping and feedback both scaled 0-1. 
  pluck(frequencies, duration = FACET_SAMPLE_RATE, damping = 0, feedback = 0.5) {
    if (typeof frequencies == 'number' || Array.isArray(frequencies) === true) {
        frequencies = new FacetPattern().from(frequencies);
    }
    frequencies.size(duration);
    duration = duration / FACET_SAMPLE_RATE;
    damping = Math.abs(Number(damping));
    feedback = Math.abs(Number(feedback));
    feedback = 0.5 + feedback * 0.5;
    let numSamples = FACET_SAMPLE_RATE * duration;
    let output = new Float32Array(numSamples);
    let string = new KarplusStrongString(frequencies.data[0], damping, feedback);
    for (let i = 0; i < numSamples; i++) {
        let frequency = frequencies.data[i];
        string.frequency = frequency;
        string.bufferSize = Math.round(FACET_SAMPLE_RATE / frequency);
        output[i] = string.process();
    }
    this.data = output;
    this.flatten().trim();
    this.fadeoutSamples(Math.round((FACET_SAMPLE_RATE/1000)*30));
    return this;
}

  // maxFrameSize allows you to hard-code the range that the data will get appended to, so that if you're
  // iteratively superposing stuff, the relative positions don't change as you add stuff to the data
  sup (addPattern, startPosition, maxFrameSize = this.data.length ) {
    if ( !this.isFacetPattern(addPattern) ) {
      throw `input must be a FacetPattern object; type found: ${typeof addPattern}`;
    }
    startPosition = Math.abs(startPosition);
    maxFrameSize = Math.abs(Math.floor(maxFrameSize));
    let start = Math.floor(startPosition * maxFrameSize);
    let output = this.data.slice();
    for (let i = 0; i < addPattern.data.length; i++) {
        if (start + i < this.data.length) {
            output[start + i] += addPattern.data[i];
        } else {
            output.push(addPattern.data[i]);
        }
    }
    this.data = output;
    return this;
  }

  splice (splicePattern, relativePosition) {
    if ( !this.isFacetPattern(splicePattern) ) {
      throw `input must be a FacetPattern object; type found: ${typeof splicePattern}`;
    }
    relativePosition = Math.abs(relativePosition);
    let position = Math.round(relativePosition * this.data.length);
    this.data.splice(position, splicePattern.data.length, ...splicePattern.data);
    return this;
  }

}
module.exports = FacetPattern;
