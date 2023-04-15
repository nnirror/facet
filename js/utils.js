const fs = require('fs');
const FacetConfig = require('./config.js');
const FACET_SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;
let env = fs.readFileSync('js/env.js', 'utf8', (err, data) => {return data});

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

function ms (ms) {
  return Math.round(Math.abs(Number(ms)) * (FACET_SAMPLE_RATE*0.001));
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
  let samples = FACET_SAMPLE_RATE / frequency;
  return samples;
}