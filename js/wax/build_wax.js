const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { sometimes,
  sample,
  slices,
  spread,
  iter,
  parallel,
  run,
  mix,
  fftPhase,
  fftMag,
  ftilt,
  flookup,
  fgate,
  tune,
  fkey,
  ffilter,
  fshift } = require('./wax_methods');
const facetPatternPath = path.join(__dirname, '../FacetPattern.js');
const facetPatternContent = fs.readFileSync(facetPatternPath, 'utf-8');
const ast = acorn.parse(facetPatternContent, { ecmaVersion: 2020 });

// methods to extract from the FacetPattern class
const included_methods = ['abs', 'add', 'allpass', 'and', 'append', 'at', 'audio', 'binary', 'biquad', 'bitshift', 'bpf', 'bpfInner', 'butterworthFilter', 'changed', 'chaos', 'chaosInner', 'circle', 'clip', 'comb', 'compress', 'convertSamplesToSeconds', 'cosine', 'crab', 'crush', 'delay', 'distavg', 'divide', 'drunk', 'dup', 'echo', 'envelope', 'equals', 'euclid', 'expo', 'fade', 'fadeArrays', 'fadein', 'fadeinSamples', 'fadeout', 'fadeoutSamples', 'ffilter', 'fftMag', 'fftPhase', 'fgate', 'fixnan', 'fkey', 'flange', 'flatten', 'flookup', 'fold', 'follow', 'fracture', 'from', 'fshift', 'ftilt', 'ftom', 'full', 'gate', 'get', 'getMaximumValue', 'gt', 'gte', 'hannWindow', 'harmonics', 'hasOwnProperty', 'hpf', 'hpfInner', 'ichunk', 'interlace', 'interp', 'invert', 'isFacetPattern', 'isPrototypeOf', 'iter', 'jam', 'key', 'log', 'logslider', 'lpf', 'lpfInner', 'lt', 'lte', 'makePatternsTheSameSize', 'map', 'markov', 'maximum', 'minimum', 'mix', 'modulo', 'mtof', 'mtos', 'mutechunks', 'nextPowerOf2', 'noise', 'nonzero', 'normalize', 'or', 'palindrome', 'parallel', 'parseKeyAndScale', 'phasor', 'pitch', 'pow', 'prepend', 'prevPowerOf2', 'primes', 'prob', 'propertyIsEnumerable', 'quantize', 'ramp', 'range', 'rangesamps', 'rechunk', 'rect', 'reduce', 'replace', 'resample', 'resizeInner', 'resonate', 'reverb', 'reverse', 'round', 'run', 'saheach', 'sample', 'scale', 'scaleLT1', 'set', 'shift', 'shuffle', 'sieve', 'silence', 'sine', 'size', 'slew', 'sliceEndFade', 'slices', 'smooth', 'sometimes', 'sort', 'speed', 'spiral', 'splice', 'spread', 'square', 'sticky', 'stretch', 'stretchto', 'stringLeftRotate', 'stringRightRotate', 'stutter', 'subset', 'subtract', 'sup', 'tanh', 'times', 'toLocaleString', 'toString', 'tri', 'trim', 'truncate', 'tune', 'turing', 'unique', 'valueOf', 'vocode', 'walk', 'warp', 'waveformSample', 'wrap'];

let extractedMethods = [];

// find the FacetPattern class and its methods
ast.body.forEach(node => {
  if (node.type === 'ClassDeclaration' && node.id.name === 'FacetPattern') {
    node.body.body.forEach(method => {
      if (
        method.type === 'MethodDefinition' &&
        included_methods.includes(method.key.name)
      ) {
        let methodCode;
        // special handling for methods that have differences between facet and wax
        if (method.key.name === 'sometimes') {
          methodCode = sometimes.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'sample') {
          methodCode = sample.toString();
          methodCode = methodCode.replace('function', '');
        } else if (method.key.name === 'slices') {
          methodCode = slices.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'spread') {
          methodCode = spread.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'iter') {
          methodCode = iter.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'parallel') {
          methodCode = parallel.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'run') {
          methodCode = run.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'mix') {
          methodCode = mix.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'fftPhase') {
          methodCode = fftPhase.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'fftMag') {
          methodCode = fftMag.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'ftilt') {
          methodCode = ftilt.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'flookup') {
          methodCode = flookup.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'fgate') {
          methodCode = fgate.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'tune') {
          methodCode = tune.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'fkey') {
          methodCode = fkey.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'ffilter') {
          methodCode = ffilter.toString();
          methodCode = methodCode.replace('function', '');
        }
        else if (method.key.name === 'fshift') {
          methodCode = fshift.toString();
          methodCode = methodCode.replace('function', '');
        }
        else {
          // extract the method code directly from the FacetPattern.js file
          const methodStart = method.start;
          const methodEnd = method.end;
          methodCode = facetPatternContent.slice(methodStart, methodEnd);

          // replace instances of this.getWholeNoteNumSamples() with SAMPLE_RATE (since there is global BPM in wax)
          methodCode = methodCode.replace(/this\.getWholeNoteNumSamples\(\)/g, 'SAMPLE_RATE');
          // replace instances of Scale.get with Tonal.Scale.get (different name spacing between wax and facet for tone.js)
          methodCode = methodCode.replace(/\bScale\.get\b/g, 'Tonal.Scale.get');
        }

        extractedMethods.push(methodCode);
      }
    });
  }
});


const beginningOfFile = `const SAMPLE_RATE = 44100;
const NYQUIST = SAMPLE_RATE / 2;

class FacetPattern {
  constructor (name) {
    this.name = name ? name : Math.random();
    this.current_iteration_number = 0;
    this.current_slice_number = 0;
    this.current_total_slices = 0;
    this.current_total_iterations = 0;
    this.set_pattern_name_after_evaluation = false;
    this.data = [];
  }

  set ( pattern_name ) {
    this.set_pattern_name_after_evaluation = pattern_name;
    return this;
  }

  get ( pattern_name) {
    if (stored_patterns[pattern_name] == undefined) {
      throw \`pattern not found: \${pattern_name}\`;
    }
    this.data = stored_patterns[pattern_name];
    return this;
  }
`;

const endOfFile = `
// ending curly brace for FacetPattern class
}

// utility functions
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
	  throw (\`barmod must contain an even number of values\`);
	}
	let allNumbers = [];
	for (let i = 0; i < mod; i++) {
		allNumbers.push(i);
	}
	for (let i = 0; i < allNumbers.length; i++) {
		if (!values.some((value, index) => index % 2 === 0 && value === allNumbers[i])) {
			throw (\`Error: every integer from 0 to \${mod-1} must be one of the even-numbered keys of the values array\`);
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
`;

// combine everything
const fileContent = `${beginningOfFile}\n${extractedMethods.join('\n\n')}\n${endOfFile}`;

// write to facetForWax.js
const outputPath = path.join(__dirname, 'facetForWax.js');
fs.writeFileSync(outputPath, fileContent);

console.log(`facetForWax.js has been generated at ${outputPath}`);