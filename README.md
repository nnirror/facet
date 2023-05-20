## Overview

Facet is an open-source live coding system for algorithmic music and synthesis. With a code editor in the browser and a pair of NodeJS servers running locally on your machine, Facet can generate and sequence audio, MIDI, and OSC data in real-time.

Facet currently runs on MacOS, Linux, and Windows.

## Installation and getting started

1. Download and install Node.js (must be v14 or greater) and npm: https://www.npmjs.com/get-npm
2. Download and install SoX as a command line tool (the latest version is 14.4.2): http://sox.sourceforge.net/ If using homebrew: `brew install sox` should work. If running on Windows: you need to modify your Path environment variable so that sox can be run from the command line. Ultimately you need to be able to run the command `sox` from the command line and verify that it's installed properly.
3. Download or clone the Facet repository.
4. In a terminal, navigate to the root of the Facet repository, and run `npm install`.
5. After the previous command completes, run `npm run facet`. This will start both servers that run in the background for Facet to work. If running on Windows: Windows has a firewall by default for local connections (on the same private network), and it needs to be disabled, or you can manually allow the connection via the confirmation dialog from the Windows firewall system when starting up the servers.
6. In a browser tab, navigate to http://localhost:1124. This is the browser window with the code editor.
7. Copy this command into the code editor in the browser: `$('test').sine(100).play();` Move your cursor so it's on the line. Hit `[ctrl + enter]` to run the command. The code editor application will always briefly highlights to illustrate what command(s) ran. You should hear a sine wave playing out of your computer's default sound card.

## Facet commands

### Syntax

Facet commands are based entirely around JavaScript, using a custom class called a `FacetPattern`. In order to produce audio or MIDI output, simply create an instance of a FacetPattern, and run some methods:

`new FacetPattern('example').sine(100).play();`

There is a shorthand for creating a new FacetPattern instance:

`$('example').sine(100).play();`

Some FacetPatterns might contain other FacetPatterns. The most outer-facing one must have a name via the above method `$()`, but other FacetPatterns inside the code can use a separate, more concise shorthand, `_`:

`$('example').sine(100).times(_.sine(100)).play();`

There are lots of methods to generate, translate, and orchestrate playback on FacetPattern data:

`$('example').sine(100).gain(random()).play();`
`// each time you run ^, the same sine wave at a different volume`

Certain operations (e.g. `sometimes()`, `iter()`, `slices()`, `mix()`) allow you to supply functions as arguments:

`$('example').iter(16,()=>{this.append(_.randsamp().speed(0.1))}).play();`
`// stitches together 16 random samples, each playing at 10x normal speed`

### UI controls in the browser

Below the text editor, there are several UI elements which control the Facet server running in the background. Moving from left to right:

- Server connection status indicator (green = online; red = offline)
- CPU% indicator
- Slider for setting the BPM of the global transport (_note_: when the `.bpm()` operation runs, this value is updated automatically)
- MIDI output selector / refresh button
- ■ = stop playback
- ⊖ = stop regenerating patterns but continue playback
- ↻ = restart system (in case it becomes unresponsive)
- 🛑 = shut down system

### Key commands

- Run command(s): `[ctrl + enter]` or `[ctrl + r]`. All commands not separated by multiple newlines will run together.
- Stop playback: `[ctrl + .]` or `[ctrl + ?]`
- Stop regenerating patterns: `[ctrl + ,]`

### Variables

#### mousex / mousey

Both `mousex` and `mousey`, as floating-point number representations of your cursor's position _in the browser window_, are available for use in commands, e.g.:

```
$('example').sine(100).gain(mousey).play(); // cursor y position controls volume every time the code runs
```

#### notevalues

There are 128 notevalues variables, corresponding to divisions of 1 whole note. A whole note is `n1`, a half note is `n2`, etc... up to `n128`.

#### bpm

The variable `bpm` (representing the current BPM in the Facet transport when the FacetPattern is generated) is available for use in commands as well.

#### bars

The variable `bars` (representing how many loops have occurred since the time the server was started) is available for use in commands as well. This is especially useful with the modulo % operator, e.g.: `bars%4`, which could be either 0, 1, 2, or 3, depending on how many loops have occurred.

## Sample rate

You can change the sample rate for the audio generated and played back with Facet by modifying `SAMPLE_RATE` in `js/config.js` to whatever integer you want.

In Facet commands, you can use the variable `FACET_SAMPLE_RATE` to refer to the configured sample rate, which is useful when you want to do something for a specific number of seconds. 

For example: `$('example').noise(FACET_SAMPLE_RATE).play(); // generate and continually play back exactly 1 second of noise`

## Global event resolution

By default, Facet checks every 2 milliseconds whether it needs to fire any events that produce output, such as playing audio, MIDI, or osc. You can change  `EVENT_RESOLUTION_MS` in `js/config.js` to set a different integer value. Slower speeds (e.g. 10 = 10ms) will produce less tightly-timed events but can help make it possible for Facet to run on computers with less CPU resources, at the expense of slight timing accuracy.

## Command reference

### Outputs

Facet can synthesize and orchestrate the playback of multiple FacetPatterns simultaneously, producing audio, MIDI, or OSC output. The patterns will continually regenerate each loop by default. In order to only regenerate every n loops, use the `.every()` function. In order to only play back once, use the `.once()` function.

### Audio output
- **channel** ( _channels_ )
	- Facet ultimately creates wav files that can have any number of channels. The `.channel()` function (and equivalent `channels()` function) allow you to route the output of a FacetPattern onto the specified channel(s) in the `channels` input array. **NOTE:** CPU will also increase as the total number of channels increases.
	- example:
		- `$('example').randsamp().channel(1).play(); // first channel only`
		- `$('example').randsamp().channels([1,3]).play(); // second channel only`
		- `$('example').randsamp().channel(_.from([9,10,11,12,13,14,15,16]).shuffle().reduce(ri(1,8))).play(); // play on a random number of channels from 9-16`
---
- **play** ( _FacetPattern_ )
	- plays the FacetPattern as audio to your computer's currently selected default audio output device, at however many positions are specified in _FacetPattern_, as the global transport loops through a whole note. If you want to use a different audio output device with Facet, simply select it as your computer's default audio output device.
	- _FacetPattern_ should contain floating-point numbers between 0 and 1, corresponding to the relative point in the transport between 0 and 1 when the generated audio should play.
	- With no arguments, the command will regenerate at point 0, i.e. at the beginning of each whole note. You can supply a number, array, or FacetPattern as the argument.
	- By default, the FacetPattern will continue to regenerate and play. To prevent it from regenerating, include a `keep()` operation. To stop playback, use the key command `[ctrl + .]` or press the stop button "■".
	- example:
		- `$('example').randsamp().play();	// plays once at beginning of loop`
		- `$('example').randsamp().play(0.5);	// plays once at middle point`
		- `$('example').randsamp().play(_.noise(4));	// plays once at 4 random positions`
---
- **saveAs** ( _filename_ )
	- creates a new wav file in the `samples/` directory or a sub-directory containing the FacetPattern. If the directory doesn't exist, it will be created.
	- example:
		- `$('example').iter(6,()=>{this.append(_.sine(ri(1,40))).saveAs('/myNoiseStuff/' + Date.now()`)}); // creates 6 wav files in the myNoiseStuff directory. Each filename is the UNIX timestamp to preserve order.

### MIDI / OSC output
You might need to activate a MIDI driver on your machine in order to send MIDI from Facet to a DAW. If Facet finds no MIDI drivers, the dropdown select UI in the browser will be empty, and if you try the below commands they will produce no output. Google "install MIDI driver {your OS goes here}" for more information.

- **note** ( _VelocityPattern_ = 100, _DurationPattern_ = 125, _channel_ = 1 )
	- sends a MIDI note on/off pair for every value in the FacetPattern's data.
	- The `VelocityPattern` and `DurationPattern` will automatically scale to match the note pattern. This allows you to modulate MIDI velocity and duration over the course of the whole note.
	- The `channel` argument by default sends the MIDI out channel 1. It can be set to any channel between 1-16.
	- example:
		- `$('example').sine(1,32).scale(36,90).round().note();`
		- `$('example').sine(1,ri(32,100)).scale(36,ri(52,100)).prob(rf()).nonzero().round().note();`
---
- **cc** ( _controller_number_ = 70, _channel_ = 1 )
	- sends a MIDI cc event bound to controller # `controller_number` for every value in the FacetPattern's data.
	- _Note_: This function is automatically scaled into the expected data range for MIDI CC data. It expects a FacetPattern of values between 0 and 1.
	- The `channel` argument by default sends the MIDI out channel 1. It can be set to any channel between 1-16.
	- example:
		- `$('example').drunk(64,0.1).cc();`
---
- **chord** ( _chord_name_, _inversion_mode_ = 0 )
	- creates a chord of MIDI notes for every value in the FacetPattern's data.
	- Here is a list of the possible chord names, as well as a numerical representation of the intervals in that chord:

	`maj` / `major` = `0,4,7`

	`min` / `minor` = `0,3,7`

	`fifth` / `5th` = `0,5`

	`seventh` / `7th` = `0,4,7,10`

	`major seventh` / `maj7` = `0,4,7,11`

	`minor seventh` / `m7` = `0,3,7,10`

	`diminished` / `dim` = `-1,2,5`

	`add2` = `0,2,4,7`

	`add9` = `0,4,7,14`

	- The `inversion_mode` can be 0, 1, 2, or 3. This number represents how many of the values in the chord have been inverted and are now below the root.
	- _Note_: to force chords into a certain key, use the `key()` operation after the `chord()` operation.
	- example:
		- `$('example').ramp(36,72,32).chord('maj7').offset((bars%4)*12).key('F# major').note(50,100,1);`
---
- **key** ( _key_and_scale_ )
	- given an input FacetPattern with data in the range of MIDI note numbers (0-127), translate all its values so they now adhere to the supplied `key_and_scale` (e.g. "C major"). The `key()` function uses the TonalJS npm package as a scale dictionary.
	- possible keys: "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"
	- possible scales: ["ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian", "bebop", "bebop dominant", "bebop major", "chromatic", "ichikosucho", "ionian pentatonic", "major pentatonic", "ritusen"]
	- example: `$('example').randsamp().reduce(32).scale(36,51).key("F# bebop").note();`
---
- **osc** ( _address_ )
	- sends a packet of OSC data to OSC address `address` for every value in the FacetPattern's data.
	- The OSC server sends output to port 5813 by default. You can change to a different port by modifying `OSC_OUTPORT` in `js/config.js` to whatever port number you need.
	- The `address` argument must begin with a backslash: `/`.
	- _Note_: This function does _not_ automatically scale the FacetPattern values between 0 and 1, so the user can send any range of numbers over OSC.
	- example:
		- `$('example').noise(128).osc('/test');`
---
- **pitchbend** ( _channel_ = 1 )
	- sends a MIDI pitchbend event for every value in the FacetPattern's data.
	- The `channel` argument by default sends the MIDI out channel 1. It can be set to any channel between 1-16.
	- _Note_: This function is automatically scaled into the expected range for MIDI pitchbend data. It expects a FacetPattern of values between 0 and 1.
	- example:
		- `$('example').sine(1).scale(0,1).size(128).pitchbend();`

### Methods for controlling transport BPM
- **bpm** ( )
	- stores the FacetPattern data in the transport as BPM values to be cycled through over each loop.
	- example:
		- `$('example').from([20,40,80,160,320]).shuffle().bpm(); // each loop will be all 5 of these BPM, randomly ordered`

### Methods for controlling pattern regeneration
- **every** ( _n_loops_ )
	- only regenerate the pattern after `n_loops` loops. By default, patterns regenerate each loop, so this function only needs to be included if you wish to regenerate a pattern less frequently.
	- example:
		- `$('example').sine(ri(10,500)).gain(rf()).every(4).play(); // slightly different sine wave tone every 4 loops`
---
- **keep** (  )
	- preserve the generated FacetPattern so that it plays each loop. Without including `keep()`, the FacetPattern will regenerate each loop by default.
	- example:
		- `$('example').sine(ri(10,500)).keep().play();`
---
- **once** (  )
	- only play the generated FacetPattern a single time. Without including `once()`, the FacetPattern will regenerate and play back each loop by default.
	- example:
		- `$('example').noise(4096).play().once();`

### Single number generators
- **choose** ( _pattern_ )
	- returns a randomly selected value from a supplied array.
	- example:
		- `$('example').sine(choose([10,200,1000])).play(); // sine wave with either 10, 200, or 1000 cycles`
---
- **ms** ( _milliseconds_ )
	- converts the supplied `milliseconds` value to that many samples, at whatever sample rate the user has configured.
	- example:
		- `$('example').noise(4096).size(ms(5)).play(); // 5ms noise`
		- `$('example').noise(4096).size(ms(50)).play(); // 50ms noise`
---
- **mtof** ( _midi_note_number_ )
	- converts the supplied `midi_note_number` value to its corresponding frequency in Hz.
	- example:
		- `$('example').sine(mtof(choose([36,38,40,41,43,45,47,48]))).play(); // random sine wave each loop in C major key`
---
- **mtos** ( _midi_note_number_ )
	- converts the supplied `midi_note_number` value to its corresponding number of samples.
	- example:
		- `$('example').noise(n4).delay(mtos(choose([36,38,40,41,43,45,47,48]))).delay(mtos(choose([36,38,40,41,43,45,47,48]))).delay(mtos(choose([36,38,40,41,43,45,47,48]))).play(); // noise is delayed by amounts that are harmonic with C major key`
---
- **random** ( _min_ = 0, _max_ = 1, _int_mode_ = 0, _weight = 1_ )
	- returns a random number between `min` and `max`. If `int_mode` = 1, returns an integer. Otherwise, returns a float by default.
	- you can also use these shorthands for a random float: `rf(min,max)` and a random integer: `ri(min,max)`.
	-  The `weight` argument allows you to specify an exponential weight for the probability of random values. For instance, `rf(0.125,8,3)` will generate half of its values between 0.125 and 1; and the other half will be between 1 and 8. By default, the weighting is linear, i.e. all values between `min` and `max` have equal probability.
	- example:
		- `$('example').sine(ri(1,1000)).play(); // a sine wave with 1 - 1000 cycles`

### FacetPattern generators
- **binary** ( _integer_, _length_)
	- Computes the binary representation of `integer`. If `length` is not present, the output FacetPattern will be the actual length of the binary representation of `integer`.
	- example:
		- `$('example').binary(8); // 1000`
		- `$('example').binary(490321,13); // 1110111101101: truncated at 13 values`
		- `$('example').binary(8,12); // 000000001000: padded with 0s`
---
- **cosine** ( _frequency_, _duration_ = 1 second, _samplerate_ = default_sample_rate )
	- generates a cosine wave at `frequency` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- Output range is from -1 - 1.
	- example:
		- `$('example').cosine(440,n4).play(); // 440 Hz cosine wave for a quarter note`
---
- **drunk** ( _length_, _intensity_ )
	- generates a random walk of values between 0 and 1 for `length` values. `intensity` controls how much to add.
	- example:
		- `$('example').drunk(16,0.1); // slight random movement`
---
- **envelope** ( _values_ )
	- Generates an envelope using the supplied array `values`, which must have a total number of entries equal to a multiple of 3. The numbers inside the `values` array should be continually ordered in groups of three: `from`, `to`, `size`, just like the `ramp()` function.
	- example:
		- ` $('example').noise(ms(500)).times(_.envelope([0,1,ms(10),1,0.1,ms(200),0.1,0,ms(290)])).play(); // transient noise burst`
---
- **euclid** ( _pulses_, _steps_ )
	- generates a Euclidean sequence with `pulses` pulses over `steps` steps.
	- example:
		- `$('example').sine(100).times(_.euclid(4,8)).play(); // gating a sine wave with a euclidean sequence`
---
- **file** ( _filename_ )
	- loads the raw data of any file into memory. You can supply any file type.
	- By default, it checks for a file in the `files` subdirectory. If no file exists there, it will try to load the file as an absolute path on your hard drive. 
	- example:
		- `$('example').file('my_image.png').play(); // if my_image.png is in the files directory, this will play the file's raw data. NOTE: this could be very noisy!`
		- `$('example').file('/Users/my_username/Desktop/myfile.zip').play(); // example with a supplied absolute file path`
---
- **fm** (_frequency_, _modulatorFrequency_, _duration_, _envelopeFacetPattern_, _modulationIndex_ = 2, _carrierWaveform_ = 0, _modulatorWaveform_ = 0)
	- generates a simple FM drum, using `frequency` and `modulatorFrequency` at the two operators, over `duration` samples. `envelopeFacetPattern` controls the amplitude contour of the generated sound. `modulationIndex` controls how heavily `modulatorFrequency` will modulate `frequency`.
	- `carrierWaveform` and `modulatorWaveform` can be any of the following: 0 = sine wave. 1 = square wave. 2 = triangle wave. 3 = sawtooth wave.
	- example:
		- `$('example').fm(50,200,n2,_.ramp(1,0,n2,0.9),10,2,2).play(); // bass stab type thing`
---
- **from** ( _pattern_ )
	- allows the user to specify their own pattern. **Note the array syntax!**
	- example:
		- `$('example').from([1,2,3,4]);`
---
- **image** ( _values_, _samplesPerColumn_ = sample_rate / 10, _maximumFrequency_ = sample_rate / 2, _frequencyOffset_ = 0 )
	- transposes an image onto the audio spectrum by generating a sine wave lasting for samplesPerColumn samples for every pixel in the image, starting with the left-most column and moving rightwards.
	- the default samplesPerColumn value of 10 means that each second of audio will contain 10 columns of pixels. This value can be larger or smaller, but keep in mind the potential for generating humongous files. The lowest pixels in the image correspond to the lowest frequencies in the output. Conversely, the highest pixels in the image correspond to the highest frequencies in the output. This method currently only works with JPEG files, and sometimes certain JPEG files won't even work. (I have submitted a GitHub issue: revisitors/readimage#4) Re-saving the JPEG files in GIMP seems to create JPEGs that the middleware this method uses can parse correctly.
	- the maximumFrequency and frequencyOffset values control the range of frequencies that the pixels will map onto.
	- example:
		- `$('example').image('/path/to/file/goes/here.jpg',1024).play(); // each column lasts 1024 samples`
---
- **noise** ( _length_ )
	- generates a random series of values between 0 and 1 for `length`.
	- example:
		- `$('example').noise(1024).play();`
---
- **phasor** ( _frequency_, _duration_ = 1 second, _samplerate_ = default_sample_rate )
	- generates a phasor wave at `frequency` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- Output range is from -1 - 1.
	- example:
		- `$('example').phasor(440,n4).play(); // 440 Hz cosine wave for a quarter note`
---
- **pluck** (_frequency_, _duration_ = 1 second, _damping_, _feedback_)
	- generates a Karplus-Strong type string pluck emulation at `frequency` Hertz, lasting for `duration` samples. `damping` and `feedback` values should be between 0 and 1.
	- Output range is from -1 - 1.
	- example:
		- `$('example').pluck(440,n4,rf(),rf()).play(); // different 440 Hz quarter note pluck each time`
---
- **primes** ( _n_, _offset_from_first_prime_ = 2, _skip_ = 1 )
	- generates the first `n` prime numbers starting at `offset`, skipping `skip` prime numbers before including the next one in the list.
	- `n` specifies the number of prime numbers to generate.
	- `offset` specifies the first number to be included in the list of prime numbers. The default value is 2.
	- `skip` specifies the number of prime numbers to skip before including the next one in the list. The default value is 1.
	- example:
		- `$('s').noise(n4).times(_.ramp(1,0,n4)).iter(12,()=>{this.allpass().delay(_.primes(60,1000,ri(20,2000)).data[i]).full()}).full().play(); // generates a quarter note transient burst of noise, then iteratively sends it through delays that are all primes`
- **ramp** ( _from_, _to_, _size_, _curve_type_ = 0.5 )
	- moves from `from` to `to` over `size` values. With a default `curve_type` of 0.5, the ramp is linear. Curve types lower than 0.5 will produce a logarithmic ramp contour, with more values weighted towards the initial `from` value. Curve types greater than 0.5 will produce an exponential ramp contour, with more values weighted towards the destination `to` value.
	- example:
		- `$('example').ramp(250,100,1000); // go from 250 to 100 over 1000 values`
---
- **randfile** ( _dir_ = `../files/` )
	- loads a random file from the `files` directory into memory. The default directory is `../files/`, but you can supply any directory as an argument.
	- example:
		- `$('example').randfile().play(); // random new file converted to audio every time`
---
- **randsamp** ( _dir_ = `../samples/` )
	- loads a random wav file from the `dir` directory into memory. The default directory is `../samples/`, but you can supply any directory as an argument.
	- example:
		- `$('example').randsamp().reverse().play(); // random backwards sample`
---
- **rect** ( _frequency_, _duration_ = 1 second, _pulse_width_ = 0.5, _samplerate_ = default_sample_rate )
	- generates a rectangle wave at `frequency` Hertz, with a pulse width defined by `pulse_width`,  lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- Output range is from -1 - 1.
	- example:
		- `$('example').rect(440,n4,rf()).play(); // 440 Hz rectangle wave for a quarter note, different bandwidth each time`
---
- **sample** ( _filename_ )
	- loads a wav file from the `samples/` directory into memory. You can specify other subdirectories inside the Facet repo as well. The `.wav` can be omitted from _filename_; in this case `.wav` it will be automatically appended to _filename_.
	- example:
		- `$('example').sample('1234').play(); // if 1234.wav is in the samples directory, you're good to go`
		- `$('example').sample('./myfolder/myfile.wav'); // or point to the file with a relative path`
---
- **silence** ( _length_ )
	- generates silence (many 0s in a row) for `length` samples.
	- example:
		- `$('example').silence(n2).append(_.noise(n2)).play(); // first half of loop is silence; second half is noise`
---
- **sine** ( _frequency_, _duration_ = sample_rate, _samplerate_ = sample_rate )
	- generates a sine wave at `frequency` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- Output range is from -1 - 1.
	- example:
		- `$('example').sine(440,n4).play(); // 440 Hz sine wave for a quarter note`
---
- **spiral** ( _length_, _degrees_ = 360/length, _angle_phase_offset_ = 0 )
	- generates a spiral of length `length` of continually ascending values in a circular loop between 0 and 1, where each value is `degrees` away from the previous value. `degrees` can be any number between 0 and 360. By default `degrees` is set to `360/length` which produces an output pattern similar to branching leaves, where each value is as far away as possible from the previous value.
	- The `angle_phase_offset` argument changes where the sequence starts. At its default value of 0, the first value will be 0. You can supply any float between 0 and 1, and the sequence will begin at that value instead.
	- example:
		- `$('example').sine(1).times(_.spiral(1000,ri(1,360))).play(); // an interesting, modulated sine wave`
---
- **square** ( _frequency_, _duration_ = sample_rate, _samplerate_ = sample_rate )
	- generates a square wave at `frequency` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- Output range is from -1 - 1.
	- example:
		- `$('example').square(440,n4).play(); // 440 Hz square wave for a quarter note`
---
- **turing** ( _length_ )
	- generates a pattern of length `length` with random 1s and 0s.
	- example:
		- `$('example').turing(64); // instant rhythmic triggers`
---
- **tri** ( _frequency_, _duration_ = sample_rate, _samplerate_ = sample_rate )
	- generates a triangle wave at `frequency` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- Output range is from -1 - 1.
	- example:
		- `$('example').tri(440,n4).play(); // 440 Hz triangle wave for a quarter note`

### FacetPattern modulators
- **abs** ( )
	- returns the absolute value of all numbers in the FacetPattern.
	- example:
		- `$('example').sine(100).offset(-0.3).abs().play(); // a wonky sine`
---
- **allpass** ( )
 	- runs the FacetPattern through an allpass filter.
 	- example:
 		- `$('example').randsamp().iter(12,()=>{this.allpass().delay(ri(1,6000))}).scale(-1,1).play(); // reverb`
 ---
- **at** ( _position_, _value_ )
	- replaces the value of a FacetPattern at the relative position `position` with `value`.
	- example:
		- `$('example').turing(16).at(0,1); // the 1st value of the 16-step Turing sequence (i.e. 0% position) is always 1`
		- `$('example').turing(16).at(0.5,2); // the 9th value of the 16-step Turing sequence (i.e. 50% position) is always 2`
---
- **audio** ( )
	- removes any DC offset on the FacetPattern by running it through a high-pass biquadratic filter at ~0Hz.
	- example:
		- `$('example').randsamp().times(_.noise(4)).audio().play();`
---
- **bpf** ( _cutoff_ = 1000, _q_ = 2.5 )
	- applies a bandpass filter with configurable `cutoff` and `q` to the FacetPattern.
	- example:
		- `$('example').noise(n1).bpf(1000,6).gain(0.1).play(); // band-passed noise`
---
- **bitshift** ( _shift_ = 16 )
	- performs a bitwise rotation on the elements of the FacetPattern object’s data array by shift bits.
	- `shift` is an optional parameter that specifies the number of bits to rotate. It defaults to 16 if not provided. The value of shift is converted to a non-negative integer and taken modulo 32 before being used.
	- The function first scales the values in the data array to a range of 0 to 1000000 and rounds them to integers. It then performs a bitwise rotation on each element using a combination of the left shift (<<) and right shift (>>>) operators. Finally, it restores the original scale of the data.
	- example:
		- `$('example').sine(1000,n2).bitshift(16).play(); // rotates the bits of a 1000Hz sine wave by 16 positions`
---
- **changed** ( )
	- returns a 1 or 0 for each value in the FacetPattern. If the value is different than the previous value, returns a 1. Otherwise returns a 0. (The first value is compared against the last value in the FacetPattern.)
	- example:
		- `$('example').from([1,1,3,4]).changed(); // 1 0 1 1`
---
- **clip** ( _min_, _max_ )
	- clips any numbers in the FacetPattern to a `min` and `max` range.
	- example:
		- `$('example').from([1,2,3,4]).clip(2,3); // 2 2 3 3 `
---
- **compress** ( _ratio_, _threshold_, _attackTime_, _releaseTime_ )
	- compresses the FacetPattern into a smaller dynamic range. `ratio` is a float between 0 and 1 corresponding to n:1 so 0.5 would be 2:1, 0.2 would be 5:1, etc. `threshold` is the sample amplitude at which compression kicks in. `attackTime` and `releaseTime` are expressed as relations to a second, so 0.1 would be 1/10th of a second.
	- example:
		- `$('example').randsamp().compress(0.1,0.001,0.01,0.01).play();`
---
- **crush** ( _crush_percent_ )
	- applies a bit crushing effect to the incoming FacetPattern, with lower `crush_percent` values creating a more drastic crush. `crush_percent` accepts values between 0 - 1.
	- example:
		- `$('example').sine(100).crush(rf()).play(); // redux on the sine wave `
---
- **curve** ( _tension_ = 0.5, _segments_ = 25 )
	- returns a curved version of the FacetPattern. Tension and number of segments in the curve can be included but default to 0.5 and 25, respectively.
	- example:
		- `$('example').noise(16).curve();				// not so noisy`
		- `$('example').noise(16).curve(0.5, 10);	// fewer segments per curve`
		- `$('example').noise(16).curve(0.9);			// different curve type`
---
- **delay** ( _samples_, _wet_ = 0.5 )
	- delays the input FacetPattern by `samples` samples. You can crossfade between the original and delayed copies with `wet`.
	- example:
		- `$('example').randsamp().delay(random(1700,10000)).play();`
---
- **distavg** ( )
	- computes the distance from the average of the FacetPattern, for each element in the FacetPattern.
	- example:
		- `$('example').from([0.1,4,3.14]).distavg(); // -2.3133 1.5867 0.7267`
---
- **dup** ( _num_ )
	- duplicates the FacetPattern `num` times.
	- example:
		- `$('example').noise(n16).dup(ri(2,12)).play(); // 16th note of noise repeats between 2 and 12 times each loop `
---
- **echo** ( _num_, _feedback_ = 0.666 )
	- repeats the FacetPattern `num` times, with amplitude multiplied by `feedback` each repeat.
	- example:
		- `$('example').from([1]).echo(5); // 1 0.666 0.4435 0.29540 0.19674 0.13103`
		- `$('example').phasor(50).size(n8).echo(7).play(); // echoing out over a whole note `
---
- **fade** ( _fade_percent_ = 0.1 )
	- applies a crossfade window to the FacetPattern, where `fade_percent` of the beginning and end are faded in/out.
	- example:
		- `$('example').noise(1024).fade().play();`
---
- **fadein** ( _fade_percent_ = 0.5 )
	- applies a fade to the beginning of the FacetPattern, where `fade_percent` of the beginning is faded in.
	- example:
		- `$('example').noise(20000).fadein().play();`
---
- **fadeout** ( _fade_percent_ = 0.5 )
	- applies a fade to the ending 50% of the FacetPattern, where `fade_percent` of the beginning is faded out.
	- example:
		- `$('example').noise(20000).fadeout().play();`
---
- **fft** ( )
	- computes the FFT of the FacetPattern, translating the FacetPattern data into "phase data" that could theoretically reconstruct it using sine waves.
	- **NOTE**: by default, this command will compute the FFT for the entire input FacetPattern, which can produce artifacts with patterns larger than the typical FFT window sample sizes (> 8192). In order to avoid this, first use the `slices()` command to slice the pattern into smaller chunks, then run the FFT on each of those chunks.
	- example:
		- `$('example').randsamp().slices(32,()=>{this.fft().shift(rf()).ifft()}).play(); // break the sample into 32 slices, compute the FFT for each slice, shift each slice's spectral data by a random amount, and run IFFT to return back into the audio realm before playback`
		- `$('example').from([1,0,1,1]).fft(); // 3 0 0 1 1 0 0 -1`
---
- **flange** ( _delaySamples_ = 220, _depth_ = 110 )
	- applies a flanger effect to the FacetPattern.
	- `delaySamples` is the base delay in samples. Controls the delay of the flanging effect.
	- `depth` is the maximum amount by which the delay is modulated. Controls the depth of the flanging effect.
	- example:
		- `$('example').sine(100,n1).flange(220,110).play(); // flanged whole note sine wave at 100Hz`
---
- **flipAbove** ( _maximum_ )
	- for all values above `maximum`, it returns `maximum` minus how far above the value was.
	- example:
		- `$('example').sine(100).flipAbove(0.2).play(); // wonky sine`
---
- **flipBelow** ( _min_ )
	- for all values below `minimum`, it returns `minimum` plus how far below the value was.
	- example:
		- `$('example').sine(100).flipBelow(0.2).play(); // inverse wonky sine`
---
- **fracture** ( _pieces_ )
	- divides and scrambles the FacetPattern into `pieces` pieces.
	- example:
		- `$('example').sine(100).fracture(10).play(); // the sine has shattered into 10 pieces!`
---
- **full** ( )
	- rescales the FacetPattern to a full dynamic range between -1 and 1, without any dynamic range compression, in a more efficient way than `scale(-1,1)`.
	- example:
		- `$('example').noise(n2).gain(0.1).loud().play(); // remove loud() to hear the difference`
---
- **gain** ( _amt_ )
	- multiplies every value in the FacetPattern by a number.
	- example:
		- `$('example').from([0,1,2]).gain(100); // 0 100 200`
		- `$('example').from([0,1,2]).gain(0.5); // 0 0.5 1`
---
- **gate** (  _threshold_, _attackSamples_, _releaseSamples_ )
	- gates the incoming FacetPattern so that any values below `threshold`, after `attackSamples` have occurred, will be set to 0, until the values go back above `threshold` for `releaseSamples`. 
	- example:
		- `$('example').sine(50).gate(0.1,20,20).play();`
---
- **gt** ( _amt_ )
	- returns `1` for every value in the FacetPattern greater than `amt` and `0` for all other values.
	- example:
		- `$('example').from([0.1,0.3,0.5,0.7]).gt(0.6); // 0 0 0 1`
---
- **gte** ( _amt_ )
	- returns `1` for every value in the FacetPattern greater than or equal to `amt` and `0` for all other values.
	- example:
		- `$('example').from([0.1,0.3,0.5,0.7]).gte(0.5); // 0 0 1 1`
---
- **harmonics** ( _num_harmonics_ )
	- adds `num_harmonics` harmonics to the input signal.
	- example:
		- `$('example').sine(10).harmonics(200).play(); // 10Hz sine wave with 200 harmonics added on top`
---
- **hpf** ( _cutoff_ = 100, _q_ = 2.5 )
	- applies a high pass filter with configurable `cutoff` and `q` to the FacetPattern.
	- example:
		- `$('example').noise(n1).hpf(2000,6).gain(0.1).play(); // high-passed noise`
---
- **ifft** ( )
	- computes the IFFT of the FacetPattern. Typically it would be used to reconstruct a FacetPattern after it had been translated into "phase data". But you can run an IFFT on any data.
	- example:
		- `$('example').randsamp().fft().shift(0.2).ifft().play(); // FFT bin shifting`
---
- **interp** ( _weight_ = 0.5, _name_ )
	- interpolates the FacetPattern with a FacetPattern. A weight of 0.5 gives equal weight to both patterns.
		- example:
		- `$('example').sine(100).interp(0.5,_.randsamp()).play(); // 50% sine wave; 50% random sample`
---
- **invert** ( )
	- computes the `minimum` and `maximum` values in the FacetPattern, then scales every number to the opposite position, relative to `minimum` and `maximum`.
	- example:
		- `$('example').from([0,0.1,0.5,0.667,1]).invert(); // 1 0.9 0.5 0.333 0`
---
- **jam** ( _prob_, _amt_ )
	- changes values in the FacetPattern.  `prob` (float 0-1) sets the likelihood of each value changing. `amt` is how much bigger or smaller the changed values can be. If `amt` is set to 2, and `prob` is set to 0.5 half the values could have any number between 2 and -2 added to them.
	- example:
		- `$('example').drunk(128,0.05).jam(0.1,0.7); // small 128 step random walk with larger deviations from the jam`
---
- **lt** ( _amt_ )
	- returns `1` for every value in the FacetPattern less than `amt` and `0` for all other values.
	- example:
		- `$('example').from([0.1,0.3,0.5,0.7]).lt(0.6); // 1 1 0 0`
---
- **lte** ( _amt_ )
	- returns `1` for every value in the FacetPattern less than or equal to `amt` and `0` for all other values.
	- example:
		- `$('example').from(0.1,0.3,0.5,0.7]).lte(0.5); // 1 1 1 0`
---
- **log** ( _intensity_ , _direction_ )
	- stretches a FacetPattern according to a logarithmic curve, where the values at the end can be stretched for a significant portion of the FacetPattern, and the values at the beginning can be squished together. The intensity of the curve is controlled by `intensity`, which accepts a float between 0 and 1. If `direction` is negative, it returns the FacetPattern in reverse.
	- example:
		- `$('example').noise(n8).log(rf()).play(); // each time a different logarithmic curve on the 8th note of noise`
---
- **lpf** ( _cutoff_ )
	- applies a low pass filter with configurable `cutoff` and `q` to the FacetPattern.
	- example:
		- `$('example').noise(n1).lpf(1000,6).gain(0.1).play(); // low-passed noise`
---
- **modulo** ( _amt_ )
	- returns the modulo i.e. `% amt` calculation for each value in the FacetPattern.
	- example:
		- `$('example').from([1,2,3,4]).modulo(3); // 1 2 0 1`
---
- **mutechunks** ( _chunks_, _prob_ )
	- slices the input FacetPattern into `chunks` chunks and mutes `prob` percent of them. __Note__: this is intended for use with FacetPatterns with a large enough amount of data to be played back at audio rate. For a similar effect on smaller FacetPatterns, use `prob()`.
	- example:
		- `$('example').randsamp().mutechunks(16,0.33).play();	// 33% of 16 audio slices muted`
---
- **normalize** ( )
	- scales the FacetPattern to the 0 - 1 range.
	- example:
		- `$('example').sine(1).gain(4000).normalize(); // the gain is undone!`
		- `$('example').sine(1).scale(-10,10).normalize(); // works with negative values`
---
- **nonzero** ( )
	- replaces all instances of 0 with the previous nonzero value. Useful after with probability controls, which by default will set some values to 0. Chaining a nonzero() after that would replace the 0s with the other values the pattern. Particularly in a MIDI context with .prob(), you probably don't want to send MIDI note values of 0, so this will effectively sample and hold each nonzero value, keeping the MIDI note values in the expected range.
	- example:
		- `$('example').from([1,2,3,4]).prob(0.5).nonzero(); // if 2 and 4 are set to 0 by prob(0.5), the output of .nonzero() would be 1 1 3 3`
---
- **offset** ( _amt_ )
	- adds `amt` to each value in the FacetPattern.
	- example:
		- `$('example').sine(4).offset(-0.2); // sine's dipping into negative territory`
---
- **palindrome** ( )
	- returns the original FacetPattern plus the reversed FacetPattern.
	- example:
		- `$('example').from([0,1,2,3]).palindrome(); // 0 1 2 3 3 2 1 0`
---
- **pitch** (  _shift_amount_ )
	- pitch-shifts the FacetPattern. `shift_amount` values between 0 and 1 will lower the pitch; e.g. a value of 0.5 will shift it down an octave. Values higher than 1 will increase the pitch; e.g. a value of 2 will be an octave higher.
	- example:
		- `$('example').sine(100).shift(rf(0.5,2)); // sometimes lower pitch, sometimes higher pitch`
---
- **pow** ( _expo_, _direction_ = 1 )
	- stretches a FacetPattern according to an exponential power `expo`, where the values at the beginning can be stretched for a significant portion of the FacetPattern, and the values at the end can be squished together. If `direction` is negative, returns the FacetPattern in reverse.
	- example:
		- `$('example').sine(100).pow(6.5).play(); // squished into the end`
		- `$('example').sine(100).pow(6.5,-1).play(); // squished at the beginning`
---
- **prob** ( _amt_ )
	- sets some values in the FacetPattern to 0. `prob` (float 0-1) sets the likelihood of each value changing.
	- example:
		- `$('example').from([1,2,3,4]).prob(0.5); // 1 0 3 0 first time it runs`
		- `$('example').from([1,2,3,4]).prob(0.5); // 0 0 3 4 second time it runs`
		- `$('example').from([1,2,3,4]).prob(0.5); // 0 2 3 4 third time it runs`
---
- **quantize** ( _resolution_ )
	- returns `0` for every step in the FacetPattern whose position is not a multiple of `resolution`.
	- example:
		- `$('example').drunk(16,0.5).quantize(4); // 0.5241 0 0 0 0.7420 0 0 0 1.0 0 0 0 0.4268 0 0 0`
---
- **range** ( _new_min_, _new_max_ )
	- returns the subset of the FacetPattern from the relative positions of `new_min` (float 0-1) and `new_max` (float 0-1).
	- example:
		- `$('example').from([0.1,0.2,0.3,0.4]).range(0.5,1); // 0.3 0.4`
---
- **rechunk** ( _chunks_ )
	- slices the input FacetPattern into `chunks` chunks and shuffles the chunks around. __Note__: this is intended for use with FacetPatterns with a large enough amount of data to be played back at audio rate. For a similar effect on smaller FacetPatterns, use `shuffle()` or `fracture`.
	- example:
		- `$('example').randsamp().rechunk(16).play();	// 16 slices from the sample in random order`
---
- **reduce** ( _new_size_ )
	- reduces the FacetPattern length to `new_size`. If `new_size` is larger than the FacetPattern length, no change.
	- example:
		- `$('example').from([1,2,3,4]).reduce(2); // 1 3`
---
- **replace** ( _original_value_, _new_value_ )
	- replaces all instances of `original_value` with `new_value` in the FacetPattern.
	- example:
		- `$('example').from([42,0,0,36]).replace(0,-1); // 42,-1,-1,36`
---
- **resonate** ( _baseFrequency_, _coefficients_, _q_ = 80, _wet_ = 1 )
	- resonates the FacetPattern running it through parallel bandpass filters. Each number in the `coefficients` FacetPattern is multiplied by the `baseFrequency` to determine the frequency for that bandpass filter.
	- example:
		- `$('example').noise(n16).times(_.ramp(1,0,n16)).resonate(mtof(36),_.ramp(1,20,20),80).play(); // 16th note transient noise burst, resonating at its first 20 harmonics starting at 65.41 Hz (MIDI note C2, mtof(36))`
---
- **reverb** (  _reverb_size_ )
	- applies a reverb effect to the FacetPattern,  using the Freeverb algorithm. Acceptable values for `reverb_size` are between 0 (very small) and 1 (huge).
	- example:
		- `$('example').randsamp().reverb(rf()).play(); // different reverb size for random sample each loop`
---
- **reverse** ( )
	- returns the reversed FacetPattern.
	- example:
		- `$('example').ramp(0,1,128).reverse(); // goes from 1 to 0 over 128 values`
---
- **round** (  )
	- rounds all values in the FacetPattern to an integer.
	- example:
		- `$('example').from([0.1,0.5,0.9,1.1]).round(); // 0 1 1 1`
---
- **saheach** ( _n_ )
	- samples and holds every `nth` value in the FacetPattern.
	- example:
		- `$('example').noise(6).saheach(2); // 0.33173470944031735, 0.33173470944031735, 0.17466890792169742, 0.17466890792169742, 0.5601080880419886,  0.5601080880419886  `
---
- **size** ( _new_size_ )
	- upscales or downscales the FacetPattern prior to playback, so its length is `new_size` samples.
	- example:
		- `$('example').noise(1000).size(n1).play(); // upscaling 1000 samples of noise to be 1 whole note long`
---
- **scale** ( _new_min_, _new_max_ )
	- moves the FacetPattern to a new range, from `new_min` to `new_max`. **NOTE**: this function will return the average of new_min and new_max if the FacetPattern is only 1 value long. since you cannot interpolate where the value would fall in the new range, without a larger FacetPattern to provide initial context of the value's relative position. This operation works better with sequences larger than 3 or 4.
	- example:
		- `$('example').sine(10,100).scale(0,1); // unipolar signal`
---
- **shift** ( _amt_ )
	- moves the FacetPattern to the left or the right. `amt` gets wrapped to values between -1 and 1, since you can't shift more than 100% left or 100% right.
	- example:
		- `$('example').from([1,2,3,4]).shift(-0.5); // 3 4 2 1`
---
- **shuffle** ( )
	- randomizes the FacetPattern.
	- example:
		- `$('example').from([1,2,3,4]).shuffle(); // first time: 3 2 1 4`
		- `$('example').from([1,2,3,4]).shuffle(); // second time: 1 3 4 2`
---
- **skip** ( _prob_ )
	- Sometimes, skip executing the command, as if it had never been attempted. Useful if you only want to update the FacetPattern some of the time, but otherwise want to preserve the previous data.
		- example:
		- `$('example').spiral(16,random(1,360)).skip(0.95); // new pattern 5% of the time when this command runs`
---
- **slew** ( _depth_ = 25, _up_speed_ = 1, _down_speed_ = 1 )
	- adds upwards and/or downwards slew to the FacetPattern. `depth` controls how many slew values exist between each value. `up_speed` and `down_speed` control how long the slew lasts: at 0, the slew has no effect, whereas at 1, the slew occurs over the entire `depth` between each FacetPattern value.
	- example:
		- `$('example').from([0,0.5,0.9,0.1]).slew(25,0,1) // the first three numbers will jump immediately because upwards slew is 0. then it will slew from 0.9 to 0.1 over the course of the entire depth range`
---
- **smooth** ( )
	- interpolates each value so it falls exactly between the values that precede and follow it.
	- example:
		- `$('example').noise(64).smooth(); // less noisy`
---
- **sort** ( )
	- returns the FacetPattern ordered lowest to highest.
	- example:
		- `$('example').noise(128).sort(); // ascending values originally from noise`
---
- **speed** ( _amt_ )
	- increases or decreases the playback speed of the FacetPattern, similar to transposing audio samples up or down. _amt_ values less than 1 speed up; _amt_ values greater than 1 slow down.
	- example
		- `$('example').randsamp().speed(0.2); // fast sample`
		- `$('example').randsamp().speed(1.5); // slow sample`
---
- **sticky** ( _amt_ )
	- samples and holds values in the FacetPattern based on probability. `amt` (float 0-1) sets the likelihood of each value being sampled and held.
	- example
		- `$('example').noise(n4).sticky(0.98); // quarter note of "sticky" noise`
---
- **stretch** ( _shift_amount_ )
	- time-stretches the FacetPattern while preserving pitch. `shift_amount` values less than 1 will shorten its overall length; values greater than 1 will increase its length.
	- example:
		- `$('example').sine(100,n4).stretch(4).play(); // stretching a quarter note sine wave to last a whole note`
---
- **stretchTo** ( _num_samples_ )
	- time-stretches the FacetPattern while preserving pitch so it now lasts `num_samples` samples.
	- example:
		- `$('example').sine(1000,n2).stretchTo(n1).play(); // 1000Hz sine wave originally a half note long, stretched to a whole note`
---
- **stutter** ( _number_of_repeats_, _start_pos_ = 0, _end_pos_ = 1 )
	- creates `_number_of_repeats_` identical chunks of data, calculated from the `start_pos` and `end_pos` values, which represent two relative positions between 0 and 1 in the input FacetPattern's data. After all the repeats have been appended to it, the FacetPattern is resized back to its original length.
	- example
		- `$('example').sine(100).stutter(16,rf(),rf()).size(n1).play(); // copies a unique sub-section of the same sine wave 16 times`
---
- **subset** ( _percentage_ )
	- returns a subset of the FacetPattern with `percentage`% values in it.
	- example:
		- `$('example').phasor(1).size(50).subset(0.3); // originally 50 values long, now 0.02 0.08 0.50 0.58 0.62 0.700 0.76 0.78 0.92`
---
- **tanh** ( _gain_ = 20 )
	- outputs the hyperbolic tangent function for the input FacetPattern, always returning values between -1 and 1. Higher `gain` values will create more intense distortion.
	- example:
		- `$('example').phasor(1,20).gain(10).tanh(6); // 0 0.995 0.9999 0.99999996 0.9999999999 0.999999999999 0.9999999999999996 1 1 1 1 1 1 1 1 1 1 1 1 1`
---
- **truncate** ( _length_ )
	- truncates the FacetPattern so it's now `length` values long. If `length` is longer than the FacetPattern, return the whole FacetPattern.
	- example:
		- `$('example').from([0,1,2,3]).truncate(2); // now 2 values long`
		- `$('example').from([0,1,2,3]).truncate(6); // still 4 values long`
---
- **unique** ( )
	- returns the set of unique values in the FacetPattern.
	- example:
		- `$('example').from([1,2,3,0,0.4,2]).unique(); // 1 2 3 0 0.4`
---
- **walk** ( _prob_, _amt_ )
	- changes positions in the FacetPattern.  `prob` (float 0-1) sets the likelihood of each position changing. `amt` controls how many steps the values can move. If `amt` is set to 10, and `prob` is set to 0.5 half the values could move 10 positions to the left or the right.
	- example:
		- `$('example').from([0,1,2,0,1,0.5,2,0]).walk(0.25, 3);`
---
- **wrap** ( _min_, _max_ )
	- folds FacetPattern values greater than `max` so their output continues at `min`.  If the values are twice greater than `max`, their output continues at `min` again. Similar for values less than `min`, such that they wrap around the min/max thresholds.
	- if no value is entered for `max`, then the first argument will be used to create the `min` and `max`, centered around 0. For instance, `wrap(0.3) == wrap(-0.3,0.3)`
	- example:
		- `$('example').sine(100).offset(-0.1).wrap(0.2,0.5).play();`
---
### Pattern modulators with a second pattern as argument
- **add** ( _FacetPattern_, _match_sizes_ = false )
	- adds the first FacetPattern and the second FacetPattern. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').randsamp().add(_.randsamp()).play(); // two random samples each loop`
- **and** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical AND of both FacetPattern, returning a 0 if one of the values is 0 and returning a 1 if both of the values are nonzero. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').from([1,0,1,0]).and(_.from([0,1])); // 0 0 1 0`
---
- **append** ( _FacetPattern_ )
	- concatenates the second FacetPattern onto the first.
	- example:
		- `$('example').sine(1).append(_.phasor(1)).append(_.from([1,2,3,4]));`
---
- **chaos** ( _FacetPattern_, _iterations_ = 100, _cx_ = 0, _cy_ = 0)
	- each piece of data in the FacetPattern is paired with the corresponding value in the second FacetPattern. The resulting complex number x,y coordinate is run through a function: f(x) = x2 + c, over `iterations` iterations. The output is a value between 0 and 1, which corresponds to how stable or unstable that particular point is in the complex number plane.
	- By default, both cx and cy are set to 0 (Mandelbrot set). But you can set them to other values from -1 to 1, which can produce all sorts of Julia set variations.
	- example: `$('example').sine(n1).chaos(_.drunk(n1,0.01)).play();`
---
- **convolve** ( _FacetPattern_ )
	- computes the convolution between the two FacetPatterns.
	- example:
		- `$('example').randsamp().convolve(_.randsamp()).play();	// convolving random samples`
---
- **divide** ( _FacetPattern_, _match_sizes_ = false )
	- divides the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1).divide(_.from([0.5,0.25,0.1,1]));`
---
- **equals** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical EQUALS of both FacetPattern, returning a 0 if the values don't equal each other and returning a 1 if they do. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1).equals(_.sine(2));`
---
- **ichunk** ( _FacetPattern_ )
	- slices the input into `FacetPattern.length` windowed chunks (to avoid audible clicks). Loops through every value of `FacetPattern` as a lookup table, determining which ordered chunk of audio from the input sequence it corresponds to, and appends that window to the output buffer.
	- example:
		- `$('example').randsamp().ichunk(_.ramp(rf(),rf(),256)).play(); // play 256 slices between two random points of a random sample... timestretching :)`
---
- **interlace** ( _FacetPattern_ )
	- interlaces two FacetPatterns. If one FacetPattern is smaller, it will be interspersed evenly throughout the other FacetPattern.
	- example:
		- `$('example').sine(1).interlace(_.phasor(1,20));`
---
- **map** ( _FacetPattern_ )
	- forces all values of the input FacetPattern to be mapped onto a new set of values from a second FacetPattern.**
	- example:
		- `$('example').from([1,2,3,4]).map([11,12,13,14]); // 11 11 11 11`
		- `$('example').from([1,2,3,4]).scale(30,34).map(_.from([31,31.5,32,32.5])); // 31 31.5 32.5 32.5`
---
- **or** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical OR of both FacetPattern, returning a 0 if both of the values are 0 and returning a 1 if either of the values are nonzero. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').from([1,0,1,0]).or(_.from([0,1])); // 1 0 1 1`
---
- **sieve** ( _FacetPattern_ )
	- uses the second FacetPattern as a lookup table, with each value's relative value determining which value from the input sequence to select.
	- example:
		- `$('example').noise(1024).sieve(_.sine(10)); // sieving noise with a sine wave into the audio rate :D`
---
- **splice** ( _FacetPattern_, _position_  )
	- inserts the second FacetPattern into the input FacetPattern at relative `position` between 0 and 1.
	- example:
		- `$('example').randsamp().splice(_.noise(n16),0.5).play(); // inserts a 16th note of noise halfway through the random sample`
---
- **subtract** ( _FacetPattern_, _match_sizes_ = false )
	- subtracts the second FacetPattern from the first. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(100).subtract(_.cosine(50)).play();`
---
- **sup** ( _FacetPattern_, _startPosition_, _maxFrameSize_ = this.length )
	- superposes a second FacetPattern onto the first. The `startPosition` value can be any value between 0 and 1. It controls the relative position in the input FacetPattern to begin superposing the second FacetPattern. The `maxFrameSize` value specifies the farthest sample value from the first FacetPattern, which would be equal to a `startPosition` of 1.
	- example:
		- `$('example').silence(n1).sup(_.randsamp(),0,n1).sup(_.randsamp(),0.5,n1).play(); // superpose two samples at the 0% and 50% points through each loop`
---
- **times** ( _FacetPattern_, _match_sizes_ = false)
	- multiplies the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(50).times(_.sine(50)).play();`

### Pattern modulators with a function as one of the arguments

- **sometimes** (_prob_, _operations_)
	- runs a chain of operations only some of the time, at a probability set by `prob`.
	- The command that will be mixed must start with the reserved word: `this` (see example).
	- example:
		- `$('example').phasor(1).sticky(0.5).scale(40,80).sometimes(0.5,()=>this.reverse());`
---
- **mix** ( _wet_, _command_, _match_sizes_ = false )
	- Mixes the input FacetPattern with a second FacetPattern generated by `command`. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- The command that will be mixed must start with the reserved word: `this` (see example).
	- example:
		- `$('example').randsamp().mix(0.5,()=>{this.reverse().speed(0.5).echo(8).speed(0.1)}).play();`
---
- **iter** ( _num_times_, _commands_ = function(), _prob_ = 1 )
	- A shorthand for rerunning a certain command over and over, with prob as a float between 0 and 1 controlling the likelihood that the code actually runs.
	- You can refer to the current iteration of the algorithm via the reserved word: `this` (see example).
	- The variable `i`, referring to the current iteration number starting at 0, is also available for use in commands.
	- The variable `iters`, referring to the total number of iterations, is also available for use in commands.
	- example:
		- `$('example').randsamp().iter(8,()=>{this.delay(ri(1,2000))}).play(); // 8 delay lines between 1 and 2000 samples`
---
- **slices** ( _num_slices_, _commands_ = function, _prob_ = 1 )
	- slices the FacetPattern into `num_slices` slices, and for `prob` percent of those slices, runs `commands`, appending all slices back together. You can refer to the current slice of the algorithm via the reserved word: `this` (see example).
	- The variable `s`, referring to the current slice number starting at 0, is also available for use in commands.
	- The variable `num_slices`, referring to the number of slices, is also available for use in commands.
	- example:
		- `$('example').randsamp().slices(32,()=>{this.fft().shift(random()).ifft()}).play();`

### Setting and getting patterns during a session

- **get** ( _name_ )
	- retrieves a FacetPattern previously stored in memory by a `.set()` command.
		- example:
		- `$('example').randsamp().set('my_pattern'); // first, set a random sample, in a separate command`
		- `$('example').get('my_pattern').reverse().dup(1).play(); // then in a new command, run this`
---
- **set** ( _name_ )
	- stores a FacetPattern in memory for temporary reference in future operations. Any FacetPatterns stored via `.set()` will only be stored until the server is closed.
		- example:
		- `$('example').noise(32).set('my_pattern').once();`