class Complex {
    constructor(real, imag) {
        this.real = real;
        this.imag = imag;
    }
  
    add(other) {
        return new Complex(this.real + other.real, this.imag + other.imag);
    }
  
    sub(other) {
        return new Complex(this.real - other.real, this.imag - other.imag);
    }
  
    mul(other) {
        return new Complex(this.real * other.real - this.imag * other.imag, this.real * other.imag + this.imag * other.real);
    }
  
    div(other) {
        let denom = other.real * other.real + other.imag * other.imag;
        return new Complex((this.real * other.real + this.imag * other.imag) / denom, (this.imag * other.real - this.real * other.imag) / denom);
    }
  }

module.exports = {
    Complex: Complex,
    fft: (input) => {
        let n = input.length;
        let m = Math.log2(n);
        if (Math.pow(2, m) !== n) {
            throw new Error('Input size must be a power of 2');
        }
        let inputComplex = input.map(x => new Complex(x, 0));
        let output = new Array(n);
        for (let i = 0; i < n; i++) {
            let j = module.exports.reverseBits(i, m);
            output[j] = inputComplex[i];
        }
        for (let s = 1; s <= m; s++) {
            let m2 = Math.pow(2, s);
            let wm = new Complex(Math.cos(-2 * Math.PI / m2), Math.sin(-2 * Math.PI / m2));
            for (let k = 0; k < n; k += m2) {
                let w = new Complex(1, 0);
                for (let j = 0; j < m2 / 2; j++) {
                    let t = w.mul(output[k + j + m2 / 2]);
                    let u = output[k + j];
                    output[k + j] = u.add(t);
                    output[k + j + m2 / 2] = u.sub(t);
                    w = w.mul(wm);
                }
            }
        }
        return output;
    },
    ifft: (input) => {
        let n = input.length;
        let m = Math.log2(n);
        if (Math.pow(2, m) !== n) {
            throw new Error('Input size must be a power of 2');
        }
        let inputComplex = input.map(x => new Complex(x.real, -x.imag));
        let output = new Array(n);
        for (let i = 0; i < n; i++) {
            let j = module.exports.reverseBits(i, m);
            output[j] = inputComplex[i];
        }
        for (let s = 1; s <= m; s++) {
            let m = Math.pow(2, s);
            let wm = new Complex(Math.cos(2 * Math.PI / m), Math.sin(2 * Math.PI / m));
            for (let k = 0; k < n; k += m) {
                let w = new Complex(1, 0);
                for (let j = 0; j < m / 2; j++) {
                    let t = w.mul(output[k + j + m / 2]);
                    let u = output[k + j];
                    output[k + j] = u.add(t);
                    output[k + j + m / 2] = u.sub(t);
                    w = w.mul(wm);
                }
            }
        }
        return output.map(x => x.div(new Complex(n, 0)));
    },
    reverseBits: (x, bits) => {
        let y = 0;
        for (let i = 0; i < bits; i++) {
            y <<= 1;
            y |= x & 1;
            x >>= 1;
        }
        return y;
    },
    computeMagnitudes: (fftOutput) => {
        let magnitudes = fftOutput.map(x => Math.sqrt(x.real * x.real + x.imag * x.imag));
        return magnitudes;
    },
    nextPowerOfTwo: (n) => {
        if (n <= 0) {
          return 1;
        }
        let power = Math.ceil(Math.log2(n));
        return Math.pow(2, power);
    }
};