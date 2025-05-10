// these are special methods that are different in wax than facet
function sample(name) {
    if (!name.endsWith('.wav')) {
        name += '.wav';
    }
    let audioBuffer = audioBuffers[name];
    if (audioBuffer) {
        this.data = audioBuffer;
    } else {
        throw `No buffer found with the name ${name}`;
    }
    return this;
}

function slices(num_slices, command, prob = 1, yes_fade = true) {
    let out_fp = new FacetPattern();
    prob = Math.abs(Number(prob));
    num_slices = Math.abs(Math.round(Number(num_slices)));
    if (num_slices == 0) {
        return sequence;
    }
    if (typeof command != 'function') {
        throw `3rd argument must be a function, type found: ${typeof command}`;
    }
    this.current_total_slices = num_slices;
    command = command.toString();
    command = command.replace(/this./g, 'current_slice.');
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    let calc_slice_size = Math.round(this.data.length / num_slices);
    let slice_start_pos, slice_end_pos;
    let current_slice;
    let i = this.current_iteration_number;
    let iters = this.current_total_iterations;
    for (var s = 0; s < num_slices; s++) {
        this.current_slice_number = s;
        slice_start_pos = s * calc_slice_size;
        slice_end_pos = slice_start_pos + calc_slice_size;
        current_slice = new FacetPattern().from(this.data).range(slice_start_pos / this.data.length, slice_end_pos / this.data.length);
        if (Math.random() < prob) {
            current_slice = eval(command);
        }
        if (this.data.length >= 1024 && yes_fade == true) {
            out_fp.sup(current_slice.fadeout(0.01), s / num_slices, this.data.length);
        } else {
            out_fp.sup(current_slice, s / num_slices, this.data.length);
        }
    }
    this.data = out_fp.data;
    this.flatten();
    return this;
}

function spread (iterations, command, startRelativePosition = 0, endRelativePosition = 1, skipIterations = []) {
    if (typeof skipIterations == 'number' || Array.isArray(skipIterations) === true) {
      skipIterations = new FacetPattern().from(skipIterations);
    }
    let maxFrameSize;
    if (this.data.length == 0 ) {
      maxFrameSize = SAMPLE_RATE;
    }
    else {
      maxFrameSize = this.data.length;
    }
    skipIterations.round().clip(0, iterations - 1);
    let out_fp = new FacetPattern();
    for (var a = 0; a < iterations; a++) {
      if (!skipIterations.data.includes(a)) {
        let calculatedPosition = startRelativePosition + (a / iterations) * (endRelativePosition - startRelativePosition);
        out_fp.sup(new FacetPattern().sometimes(1,command,{i:a,iters:iterations}),calculatedPosition,maxFrameSize);
      }
    }
    this.data = out_fp.data;
    return this;
  }

  function iter (iters, command, prob = 1) {
    this.original_data = this.data;
    prob = Math.abs(Number(prob));
    iters = Math.abs(Math.round(Number(iters)));
    if ( iters == 0 ) {
      return this;
    }
    if ( typeof command != 'function' ) {
      throw `3rd argument to .iter() must be a function, type found: ${typeof command}`;
    }
    this.current_total_iterations = iters;
    command = command.toString();
    command = command.replace(/current_slice./g, 'this.');
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    let s = this.current_slice_number;
    let num_slices = this.current_total_slices;
    for (var i = 0; i < iters; i++) {
      this.current_iteration_number = i;
      if ( Math.random() < prob ) {
        eval(command);
      }
    }
    return this;
  }

  function parallel (commands) {
    if ( typeof commands != 'object' && Array.isArray(commands) == false ) {
      throw `input to parallel() must be an array of functions, type found: ${typeof commands}`;
    }
    let initial_maximum_value = this.getMaximumValue();
    let out_fp = new FacetPattern();
    let initial_fp = new FacetPattern().from(this.data);
    let i = this.current_iteration_number;
    let iters = this.current_total_iterations;
    let s = this.current_slice_number;
    let num_slices = this.current_total_slices;
    for (let [key, command] of Object.entries(commands)) {
      this.data = initial_fp.data;
      command = command.toString();
      command = command.replace(/current_slice./g, 'this.');
      command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
      eval(command);
      out_fp.sup(this,0);
    }
    this.data = out_fp.data;
    this.fixnan();
    this.full(initial_maximum_value);
    return this;
  }

 function run (command) {
    this.sometimes(1,command);
    return this;
  }

  function mix ( wet, command) {
    if ( typeof command != 'function' ) {
      throw `2nd argument must be a function, type found: ${typeof command}`;
    }
    command = command.toString();
    command = command.slice(command.indexOf("{") + 1, command.lastIndexOf("}"));
    command = command.replace(/current_slice./g, 'this.');
    wet = Math.abs(Number(wet));
    let dry = Math.abs(wet-1);
    let dry_data = new FacetPattern().from(this.data).times(dry);
    let i = this.current_iteration_number;
    let iters = this.current_total_iterations;
    let s = this.current_slice_number;
    let num_slices = this.current_total_slices;
    eval(command);
    let wet_data = new FacetPattern().from(this.data).times(wet);
    let mixed_data = dry_data.sup(wet_data, 0);
    this.data = mixed_data.data;
    return this;
  }

  function fftPhase ( complexNumber ) {
    return Math.atan2(complexNumber[1], complexNumber[0]);
  }

  function  fftMag ( complexNumber ) {
    return Math.sqrt(complexNumber[0]**2 + complexNumber[1]**2);
  }

  function ftilt(rotations) {
    if ( this.isFacetPattern(rotations) ) {
      rotations = rotations.data;
    }
    let dataLength = this.data.length;
    let nextPowerOfTwo = this.nextPowerOf2(dataLength);
    if (dataLength !== nextPowerOfTwo) {
        this.data.push(...Array(nextPowerOfTwo - dataLength).fill(0));
    }
    const phasors = fft(this.data);
    const numContainers = rotations.length;

    // calculate the number of bins per container
    const binsPerContainer = Math.floor(phasors.length / numContainers);

    // normalize rotations to range [-PI, PI]
    const normalizedRotations = rotations.map(rotation => rotation * Math.PI);

    // apply rotations to each container
    for (let i = 0; i < numContainers; i++) {
      for (let j = 0; j < binsPerContainer; j++) {
          const binIndex = i * binsPerContainer + j;
          if (binIndex < phasors.length) {
              // calculate frequency of this bin
              const frequency = binIndex * SAMPLE_RATE / phasors.length;

              // calculate time delay for this container
              const timeDelay = normalizedRotations[i];

              // calculate phase shift for this bin
              const phaseShift = 2 * Math.PI * frequency * timeDelay;

              // extract magnitude and phase
              const magnitude = this.fftMag(phasors[binIndex]);
              let phase = this.fftPhase(phasors[binIndex]);

              // apply phase shift
              phase += phaseShift;

              // convert back to rectangular form
              phasors[binIndex] = [magnitude * Math.cos(phase), magnitude * Math.sin(phase)];
          }
      }
    }

    // inverse FFT to resynthesize audio
    const complexData = ifft(phasors);

    // convert complex data to 1D signal by taking the magnitude of each complex number
    const resynthesizedData = complexData.map(complexNumber => Math.sqrt(complexNumber[0]**2 + complexNumber[1]**2));

    this.data = resynthesizedData;
    this.audio().truncate(dataLength);
    return this;
  }

  function flookup ( lookup ) {
    if ( this.isFacetPattern(lookup) ) {
      lookup.clip(0,1).size(this.data.length/4);
      lookup = lookup.data;
    }
    const numContainers = lookup.length;
    const frameSize = Math.floor(this.data.length / numContainers);
    const hopSize = Math.floor(frameSize / 2); // 50% overlap
    const original_size = this.data.length;

    // divide this.data into overlapping frames
    const frames = [];
    for (let i = 0; i <= this.data.length - frameSize; i += hopSize) {
        let frame = this.data.slice(i, i + frameSize);
        let nextPowerOfTwo = this.nextPowerOf2(frame.length);
        if (frame.length !== nextPowerOfTwo) {
            frame.push(...Array(nextPowerOfTwo - frame.length).fill(0));
        }
        frames.push(frame);
    }

    // apply FFT to each frame
    const phasors = frames.map(frame => fft(frame));

    // use repeated lookup array to rearrange frames
    const rearrangedFrames = lookup.map(value => {
      const frameIndex = Math.floor(value * (phasors.length - 1));
      return phasors[frameIndex];
    });

    // apply inverse FFT to each frame
    const resynthesizedFrames = rearrangedFrames.map(frame => ifft(frame));

    // overlap-add frames to resynthesize signal
    const resynthesizedSignal = new Array(this.data.length).fill(0);
    for (let i = 0; i < resynthesizedFrames.length; i++) {
        for (let j = 0; j < resynthesizedFrames[i].length; j++) {
            if (i * hopSize + j < resynthesizedSignal.length) {
                resynthesizedSignal[i * hopSize + j] += resynthesizedFrames[i][j][0]; // assuming ifft returns complex numbers
            }
        }
    }
    this.data = resynthesizedSignal;
    this.trim().size(original_size).audio();
    return this;
}

function fgate(binThresholds, invert = 0) {
    if (typeof binThresholds == 'number' || Array.isArray(binThresholds) === true) {
      binThresholds = new FacetPattern().from(binThresholds);
    }
    binThresholds.reduce(256);
    binThresholds = binThresholds.data;
    let original_size = this.data.length;
    let resynthesizedSignal = new FacetPattern();
  
    for (let s = 0; s < binThresholds.length; s++) {
        let binThreshold = Math.min(Math.max(binThresholds[s], 0), 1);
  
        let sliceSize = Math.ceil(this.data.length / binThresholds.length);
        let sliceStart = s * sliceSize;
        let sliceEnd = sliceStart + sliceSize;
        let dataSlice = this.data.slice(sliceStart, sliceEnd);
  
        let next_power_of_two = this.nextPowerOf2(dataSlice.length);
        dataSlice.push(...Array(next_power_of_two-dataSlice.length).fill(0));
        let n = dataSlice.length;
        let m = Math.log2(n);
  
        if (Math.pow(2, m) !== n) {
            throw new Error('Input size must be a power of 2');
        }
  
        let inputComplex = dataSlice.map(x => new Complex(x, 0));
        let output = new Array(n);
        for (let i = 0; i < n; i++) {
            let j = reverseBits(i, m);
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
  
        // each entry in magnitude_fp is a frequency bin. normalized magnitude between 0 and 1.
        let magnitude_fp = new FacetPattern().from(computeMagnitudes(output)).scale(0,1);
        for (var a = 0; a < output.length; a++ ) {
          // look up bin's relative magnitude - if less than bin threshold, set to 0
          if (invert) {
            if (magnitude_fp.data[a] >= binThreshold) {
              output[a] = new Complex(0,0);
            }
          } else {
            if (magnitude_fp.data[a] < binThreshold) {
              output[a] = new Complex(0,0);
            }
          }
        }
        let ifftOutput = ifft(output);
        resynthesizedSignal.append(new FacetPattern().from(ifftOutput.map(x => x.real)).reverse().truncate(sliceSize).fadeinSamples(Math.round(SAMPLE_RATE*.002)).fadeoutSamples(Math.round(SAMPLE_RATE*.002)));
    }
  
    this.data = resynthesizedSignal.data;
    this.truncate(original_size);
    return this;
  }

  function tune (key_letter = "C", binThreshold = 0.005) {
    let chroma_key = this.parseKeyAndScale(key_letter,new FacetPattern().from(1));
    chroma_key = chroma_key.split('');
    let notes_in_key = [];
    let octave_count = 0;
    for (let i = 0; i < 128; i++) {
      if ( chroma_key[i%12] == 1 ) {
        notes_in_key.push((i%12) + octave_count);
      }
      if ( i > 11 && i % 12 == 0) {
        octave_count += 12;
      }
    }
    this.fkey(new FacetPattern().from(notes_in_key),binThreshold);
    return this;
  }

  function fkey (midiNotes, binThreshold = 0.005, maxHarmonic = 10) {
    if (typeof midiNotes == 'number' || Array.isArray(midiNotes) === true) {
      midiNotes = new FacetPattern().from(midiNotes);
    }
    midiNotes = midiNotes.data;
  
    let original_size = this.data.length;
    let next_power_of_two = this.nextPowerOf2(this.data.length);
    this.append(new FacetPattern().silence(next_power_of_two-this.data.length));
    let n = this.data.length;
    let m = Math.log2(n);
  
    if (Math.pow(2, m) !== n) {
        throw new Error('Input size must be a power of 2');
    }
    let inputComplex = this.data.map(x => new Complex(x, 0));
    let output = new Array(n);
    for (let i = 0; i < n; i++) {
        let j = reverseBits(i, m);
        output[j] = inputComplex[i];
    }
    for (let s = 1; s <= m; s++) {
        let m = Math.pow(2, s);
        let wm = new Complex(Math.cos(-2 * Math.PI / m), Math.sin(-2 * Math.PI / m));
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
  
    // convert MIDI notes to frequencies
    let midiFrequencies = midiNotes.map(note => 440 * Math.pow(2, (note - 69) / 12));
  
    // get the bin frequencies
    let binFrequencies = [];
    for (let i = 0; i < n/2; i++) {
        binFrequencies.push(i * SAMPLE_RATE/n);
    }
  
    // gate the bins
    for (let i = 0; i < binFrequencies.length; i++) {
        let binFrequency = binFrequencies[i];
        let isCloseToMidiFrequency = false;
        for (let j = 0; j < midiFrequencies.length; j++) {
            let midiFrequency = midiFrequencies[j];
            if (Math.abs(binFrequency - midiFrequency) <= binThreshold * midiFrequency) {
                isCloseToMidiFrequency = true;
                break;
            }
            // check harmonics
            for (let k = 2; k <= maxHarmonic; k++) {
                if (Math.abs(binFrequency - k*midiFrequency) <= binThreshold * k*midiFrequency) {
                    isCloseToMidiFrequency = true;
                    break;
                }
            }
            if (isCloseToMidiFrequency) break;
        }
        if (!isCloseToMidiFrequency) {
            output[i] = new Complex(0,0);
            output[n-i-1] = new Complex(0,0);
        }
    }
  
    let ifftOutput = ifft(output);
    let resynthesizedSignal = ifftOutput.map(x => x.real);
    this.data = resynthesizedSignal;
    this.reverse();
    this.truncate(original_size);
    this.fadeinSamples(Math.round(SAMPLE_RATE*.002)).fadeoutSamples(Math.round(SAMPLE_RATE*.002));
    return this;
  }

function ffilter (minFreqs, maxFreqs, invertMode = false) {
    if (typeof minFreqs == 'number' || Array.isArray(minFreqs) === true) {
      minFreqs = new FacetPattern().from(minFreqs);
    }
    if (typeof maxFreqs == 'number' || Array.isArray(maxFreqs) === true) {
      maxFreqs = new FacetPattern().from(maxFreqs);
    }
    this.makePatternsTheSameSize(minFreqs,maxFreqs);
    minFreqs = minFreqs.data;
    maxFreqs = maxFreqs.data;
    let original_size = this.data.length;
    let resynthesizedSignal = new FacetPattern();
  
    for (let s = 0; s < minFreqs.length; s++) {
        let minFreq = Math.max(minFreqs[s], 0);
        let maxFreq = Math.max(maxFreqs[s], 0);
  
        let sliceSize = Math.ceil(this.data.length / minFreqs.length);
        let sliceStart = s * sliceSize;
        let sliceEnd = sliceStart + sliceSize;
        let dataSlice = this.data.slice(sliceStart, sliceEnd);
  
        let next_power_of_two = this.nextPowerOf2(dataSlice.length);
        dataSlice.push(...Array(next_power_of_two-dataSlice.length).fill(0));
        let n = dataSlice.length;
        let m = Math.log2(n);
  
        if (Math.pow(2, m) !== n) {
            throw new Error('Input size must be a power of 2');
        }
  
        let inputComplex = dataSlice.map(x => new Complex(x, 0));
        let output = new Array(n);
        for (let i = 0; i < n; i++) {
            let j = reverseBits(i, m);
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
  
        // filter out bins whose frequency is less than minFreq or greater than maxFreq
        let binSize = SAMPLE_RATE / n;
        for (var a = 0; a < output.length/2; a++ ) {
          // calculate bin frequency
          let binFreq = a * binSize;
          if (invertMode === false) {
            if (binFreq < minFreq || binFreq > maxFreq) {
              output[a] = new Complex(0,0);
              output[output.length-a-1] = new Complex(0,0);
            }
          }
          else {
            if (binFreq > minFreq && binFreq < maxFreq) {
              output[a] = new Complex(0,0);
              output[output.length-a-1] = new Complex(0,0);
            }
          }
        }
  
        let ifftOutput = ifft(output);
        resynthesizedSignal.append(new FacetPattern().from(ifftOutput.map(x => x.real)).reverse().truncate(sliceSize));
      }
      this.data = resynthesizedSignal.data;
      this.truncate(original_size);
      this.fadeinSamples(Math.round(SAMPLE_RATE*.002)).fadeoutSamples(Math.round(SAMPLE_RATE*.002));
      return this;
    }

    function fshift(shiftAmounts) {
        if (typeof shiftAmounts == 'number' || Array.isArray(shiftAmounts) === true) {
          shiftAmounts = new FacetPattern().from(shiftAmounts);
        }
        shiftAmounts = shiftAmounts.data;
        let original_size = this.data.length;
        let resynthesizedSignal = new FacetPattern();
    
        for (let s = 0; s < shiftAmounts.length; s++) {
            let shiftAmount = Math.min(Math.max(shiftAmounts[s], -1), 1);
            if (shiftAmount >= 0) {
                shiftAmount = Math.abs(shiftAmount) * 0.5;
            } else {
                shiftAmount = (1 + shiftAmount) * 0.5;
            }
    
            let sliceSize = Math.ceil(this.data.length / shiftAmounts.length);
            let sliceStart = s * sliceSize;
            let sliceEnd = sliceStart + sliceSize;
            let dataSlice = this.data.slice(sliceStart, sliceEnd);
    
            let next_power_of_two = this.nextPowerOf2(dataSlice.length);
            dataSlice.push(...Array(next_power_of_two-dataSlice.length).fill(0));
            let n = dataSlice.length;
            let m = Math.log2(n);
    
            if (Math.pow(2, m) !== n) {
                throw new Error('Input size must be a power of 2');
            }
    
            let inputComplex = dataSlice.map(x => new Complex(x, 0));
            let output = new Array(n);
            for (let i = 0; i < n; i++) {
                let j = reverseBits(i, m);
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
    
            // shift the FFT bins by the specified amount
            let shiftBins = Math.round(shiftAmount * n);
            let shiftedOutput = new Array(n);
            if (shiftAmount > 0) {
                for (let i = 0; i < n; i++) {
                    shiftedOutput[(i + shiftBins) % n] = output[i];
                }
            } else {
                for (let i = n -1 ; i >=0 ; i--) {
                    shiftedOutput[(i + shiftBins + n) % n] = output[i];
                }
            }
    
            let ifftOutput = ifft(shiftedOutput);
            let abc = new FacetPattern().from(ifftOutput.map(x => x.real));
            resynthesizedSignal.append(abc.reverse().truncate(sliceSize).fadeinSamples(Math.round(SAMPLE_RATE*.002)).fadeoutSamples(Math.round(SAMPLE_RATE*.002)));
        }
    
        this.data = resynthesizedSignal.data;
        this.truncate(original_size);
        return this;
      }

module.exports = {
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
    fshift
};