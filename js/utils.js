const fs = require('fs');
const FacetConfig = require('./config.js');
const SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
const NYQUIST = SAMPLE_RATE / 2;  

function $ (n) {
  if (!n) {
    return new FacetPattern(Math.random());
  }
  else {
    return new FacetPattern(n);
  }
}

function choose (list) {
  return list[Math.floor(Math.random()*list.length)];
}

function decide () {
  return Math.random() > 0.5 ? 1 : 0;
}

function cof (index) {
  return ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'][index%12];
}

function ftom(frequency) {
  return Math.round(12 * Math.log2(frequency / 440) + 69);
}

function ms (ms) {
  return Math.round(Math.abs(Number(ms)) * (SAMPLE_RATE*0.001));
}

function mtof(note) {
  note = Math.abs(Number(note));
  return Math.pow(2,(note-69)/12) * 440;
}

function ri (min = 0, max = 1, weight = 1) {
  return random(min,max,1,weight);
}

function rf (min = 0, max = 1, weight = 1) {
  return random(min,max,0,weight);
}

function random(min = 0, max = 1, int_mode = 0, weight = 1) {
  let num = Math.pow(Math.random(), weight) * (Number(max) - Number(min)) + Number(min);
  if (int_mode != 0) {
      num = Math.round(num);
  }
  return num;
}

function randscale() {
  let all_scales = ["major pentatonic", "major", "minor", "major blues", "minor blues", "melodic minor", "harmonic minor", "bebop", "diminished", "dorian", "lydian", "mixolydian", "phrygian", "locrian", "ionian pentatonic", "mixolydian pentatonic", "ritusen", "egyptian", "neopolitan major pentatonic", "vietnamese 1", "pelog", "kumoijoshi", "hirajoshi", "iwato", "in-sen", "lydian pentatonic", "malkos raga", "locrian pentatonic", "minor pentatonic", "minor six pentatonic", "flat three pentatonic", "flat six pentatonic", "scriabin", "whole tone pentatonic", "lydian #5P pentatonic", "lydian dominant pentatonic", "minor #7M pentatonic", "super locrian pentatonic", "minor hexatonic", "augmented", "piongio", "prometheus neopolitan", "prometheus", "mystery #1", "six tone symmetric", "whole tone", "messiaen's mode #5", "locrian major", "double harmonic lydian", "altered", "locrian #2", "mixolydian b6", "lydian dominant", "lydian augmented", "dorian b2", "ultralocrian", "locrian 6", "augmented heptatonic", "dorian #4", "lydian diminished", "leading whole tone", "lydian minor", "phrygian dominant", "balinese", "neopolitan major", "harmonic major", "double harmonic major", "hungarian minor", "hungarian major", "oriental", "flamenco", "todi raga", "persian", "enigmatic", "major augmented", "lydian #9", "messiaen's mode #4", "purvi raga", "spanish heptatonic", "bebop minor", "bebop major", "bebop locrian", "minor bebop", "ichikosucho", "minor six diminished", "half-whole diminished", "kafi raga", "messiaen's mode #6", "composite blues", "messiaen's mode #3", "messiaen's mode #7", "chromatic"];
  return all_scales[Math.floor(Math.random()*all_scales.length)];
}

function mtos(midiNoteIn) {
  let frequency = Math.pow(2, (midiNoteIn - 69) / 12) * 440;
  let samples = SAMPLE_RATE / frequency;
  return samples;
}

function ts () {
  return Date.now();
}

function barmod(mod, values) {
  mod = Math.round(Math.abs(Number(mod)));
  if ( values.length % 2 != 0 ) {
    throw (`barmod must contain an even number of values`);
  }
  let allNumbers = [];
  for (let i = 0; i < mod; i++) {
      allNumbers.push(i);
  }
  for (let i = 0; i < allNumbers.length; i++) {
      if (!values.some((value, index) => index % 2 === 0 && value === allNumbers[i])) {
          throw (`Error: every integer from 0 to ${mod-1} must be one of the even-numbered keys of the values array`);
      }
  }
  let result = bars % mod;
  for (let i = 0; i < values.length; i += 2) {
      if (values[i] === result) {
          return values[i + 1];
      }
  }
}

function scale(oldValue, oldMin, oldMax, newMin, newMax) {
  return (newMax - newMin) * (oldValue - oldMin) / (oldMax - oldMin) + newMin;
}