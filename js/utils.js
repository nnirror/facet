const fs = require('fs');
const FacetConfig = require('./config.js');
const SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;

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

function mtos(midiNoteIn) {
  let frequency = Math.pow(2, (midiNoteIn - 69) / 12) * 440;
  let samples = SAMPLE_RATE / frequency;
  return samples;
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