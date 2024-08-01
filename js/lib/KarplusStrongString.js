const FacetConfig = require('../config.js');
const FACET_SAMPLE_RATE = FacetConfig.settings.SAMPLE_RATE;

class KarplusStrongString {
    constructor(frequency, damping, feedback) {
        this._frequency = frequency;
        this.damping = damping;
        this.feedback = feedback;
        this.bufferSize = Math.round(FACET_SAMPLE_RATE / frequency);
        this.buffer = new Float32Array(this.bufferSize);
        for (let i = 0; i < this.bufferSize; i++) {
            this.buffer[i] = Math.random() * 2 - 1;
        }
        this.output = 0;
        this.index = 0;
    }

    set frequency(frequency) {
        if (frequency !== this._frequency) {
            let newBufferSize = Math.round(FACET_SAMPLE_RATE / frequency);
            if (newBufferSize !== this.bufferSize) {
                let newBuffer = new Float32Array(newBufferSize);
                newBuffer.set(this.buffer.subarray(0, Math.min(this.bufferSize, newBufferSize)));
                this.buffer = newBuffer;
                this.bufferSize = newBufferSize;
            }
            this._frequency = frequency;
        }
    }

    get frequency() {
        return this._frequency;
    }

    process(maxIterations = FACET_SAMPLE_RATE * 8, windowSize = 100, silenceThreshold = 0.001) {
        let output = [];
        for (let i = 0; i < maxIterations; i++) {
            let value = this.buffer[this.index];
            this.output = value;
            let nextValue = this.buffer[(this.index + 1) % this.bufferSize];
            value += (nextValue - value) * this.damping;
            value *= this.feedback;
            this.buffer[this.index] = value;
            this.index = (this.index + 1) % this.bufferSize;
            output.push(this.output);
            let windowSamples = output.slice(-windowSize);
            let windowAverage = windowSamples.reduce((sum, sample) => sum + Math.abs(sample), 0) / windowSize;
            if (i >= windowSize && windowAverage < silenceThreshold) {
                break;
            }
        }
        return output;
    }
}

module.exports = {
    KarplusStrongString: KarplusStrongString
};