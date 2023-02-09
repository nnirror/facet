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

function ri (min = 0, max = 1) {
  return random(min,max,1);
}

function rf (min = 0, max = 1) {
  return random(min,max,0);
}

function random(min = 0, max = 1, int_mode = 0) {
  let num = Math.random() * (Number(max) - Number(min)) + Number(min);
  if ( int_mode != 0 ) {
    num = Math.round(num);
  }
  return num;
}
