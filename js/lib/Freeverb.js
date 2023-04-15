// forked JS implementation of the Freeverb algorithm initially provided by ChatGPT

class Freeverb {
    constructor(size) {
        this.combFilters = [];
        this.allPassFilters = [];
        this.tuning = {
            combCount: 8,
            allPassCount: 4,
            fixedGain: 0.015,
            scaleDamping: 0.4,
            scaleRoom: 0.28,
            offsetRoom: 0.7,
            stereoSpread: 0,
            combTuning: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617],
            allPassTuning: [556, 441, 341, 225]
        };
        for (let i = 0; i < this.tuning.combCount; i++) {
            let combFilter = new CombFilter(this.tuning.combTuning[i]*size);
            combFilter.feedback = this.tuning.scaleRoom + this.tuning.offsetRoom;
            combFilter.damp1 = this.tuning.scaleDamping;
            combFilter.damp2 = 1 - this.tuning.scaleDamping;
            this.combFilters.push(combFilter);
        }
        for (let i = 0; i < this.tuning.allPassCount; i++) {
            let allPassFilter = new AllPassFilter(this.tuning.allPassTuning[i]);
            allPassFilter.feedback = 0.5;
            this.allPassFilters.push(allPassFilter);
        }
    }
  
    process(input) {
        let output = new Float32Array(input.length);
        for (let i = 0; i < input.length; i++) {
            let out = 0;
            for (let j = 0; j < this.combFilters.length; j++) {
                out += this.combFilters[j].process(input[i]);
            }
            for (let j = 0; j < this.allPassFilters.length; j++) {
                out = this.allPassFilters[j].process(out);
            }
            output[i] = out * this.tuning.fixedGain;
        }
        return output;
    }
  }
  
  class CombFilter {
    constructor(bufferSize) {
        this.buffer = new Float32Array(bufferSize);
        this.bufferIndex = 0;
        this.feedback = 0.1;
        this.damp1 = 0.5;
        this.damp2 = 0;
        this.filterStore = 0;
    }
  
    process(input) {
        let output = this.buffer[this.bufferIndex];
        this.filterStore = (output * (1 - this.damp2)) + (this.filterStore * this.damp2);
        this.buffer[this.bufferIndex] = input + (this.filterStore * this.feedback);
        if (++this.bufferIndex >= this.buffer.length) {
            this.bufferIndex = 0;
        }
        return output;
    }
  }
  
  class AllPassFilter {
    constructor(bufferSize) {
        this.buffer = new Float32Array(bufferSize);
        this.bufferIndex = 0;
        this.feedback = 0.5;
    }
  
    process(input) {
        let bufferOutput = this.buffer[this.bufferIndex];
        let output = -input + bufferOutput;
        this.buffer[this.bufferIndex] = input + (bufferOutput * this.feedback);
        if (++this.bufferIndex >= this.buffer.length) {
            this.bufferIndex = 0;
        }
        return output;
    }
  }

  module.exports = {
    Freeverb: Freeverb
  };