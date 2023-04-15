// forked JS implementation of a Karplus-Strong algorithm initially provided by ChatGPT

class KarplusStrongString {
    constructor(frequency, damping, feedback) {
        this.frequency = frequency;
        this.damping = damping;
        this.feedback = feedback;
        this.bufferSize = Math.round(44100 / frequency);
        this.buffer = new Float32Array(this.bufferSize);
        for (let i = 0; i < this.bufferSize; i++) {
            this.buffer[i] = Math.random() * 2 - 1;
        }
        this.output = 0;
        this.index = 0;
    }
  
    process() {
        let value = this.buffer[this.index];
        this.output = value;
        let nextValue = this.buffer[(this.index + 1) % this.bufferSize];
        value += (nextValue - value) * this.damping;
        value *= this.feedback;
        this.buffer[this.index] = value;
        this.index = (this.index + 1) % this.bufferSize;
        return this.output;
    }
  }

  module.exports = {
    KarplusStrongString: KarplusStrongString
  };