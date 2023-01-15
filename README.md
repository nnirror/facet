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
7. Copy this command into the code editor in the browser: `$('test').sine(100,200).play();` Move your cursor so it's on the line. Hit `[ctrl + enter]` to run the command. The code editor application will always briefly highlights to illustrate what command(s) ran. You should hear a sine wave playing out of your computer's default sound card.

## Facet commands

### Syntax

Facet commands are based entirely around JavaScript, using a custom class called a `FacetPattern`. In order to produce audio or MIDI output, simply create an instance of a FacetPattern, and run some methods:

`new FacetPattern('example').sine(100,200).play();`

There is a shorthand for creating a new FacetPattern instance:

`$('example').sine(100,200).play();`

Some FacetPatterns might contain other FacetPatterns. The most outer-facing one must have a name via the above method `$()`, but other FacetPatterns inside the code can use a separate, more concise shorthand, `_`:

`$('example').sine(100,200).times(_.sine(100,200)).play();`

There are lots of methods to generate, translate, and orchestrate playback on FacetPattern data:

`$('example').sine(100,200).gain(random()).play();`
`// each time you run ^, the same sine wave at a different volume`

Certain operations (e.g. `sometimes()`, `iter()`, `slices()`, `mix()`) allow you to supply functions as arguments:

`$('example').iter(16,()=>{this.append(_.randsamp().speed(0.1))}).play();`
`// stitches together 16 random samples, each playing at 10x normal speed`

### UI controls in the browser

Below the text editor, there are several UI elements which control the Facet server running in the background. Moving from left to right:

- Server connection status indicator (green = online; red = offline)
- CPU% indicator
- Slider for setting the BPM of the global transport (_note_: when the `.bpm()` operation runs, this value is updated automatically)
- Slider for setting the number of steps in a whole note (_note_: when the `.steps()` operation runs, this value is updated automatically)
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
$('example').sine(100,200).gain(mousey).play(); // cursor y position controls volume every time the code runs
```

#### notevalues

There are 128 notevalues variables, corresponding to divisions of 1 whole note. A whole note is `n1`, a half note is `n2`, etc... up to `n128`.

#### bpm / steps

Both `bpm` and `steps`, representing the current BPM and number of steps per loop in the Facet transport, are available for use in commands as well.

## Sample rate

You can change the sample rate for the audio generated and played back with Facet by modifying `SAMPLE_RATE` in `js/config.js` to whatever integer you want.

## Command reference

### Outputs

Facet can synthesize and orchestrate the playback of multiple FacetPatterns simultaneously, producing audio, MIDI, or OSC output. The patterns will continually regenerate each loop by default.

### Audio input and output
- **channel** ( _channels_ )
	- Facet ultimately creates wav files that can have any number of channels. The `.channel()` function (and equivalent `channels()` function) allow you to route the output of a FacetPattern onto the specified channel(s) in the `channels` input array. **NOTE:** CPU will also increase as the total number of channels increases.
	- example:
		- `$('example').randsamp().channel(1).play(); // first channel only`
		- `$('example').randsamp().channels([1,3]).play(); // second channel only`
		- `$('example').randsamp().channel(_.from([9,10,11,12,13,14,15,16]).shuffle().reduce(random(1,8,1))).play(); // play on a random number of channels from 9-16`
---
- **play** ( _FacetPattern_ )
	- plays the FacetPattern as audio to your computer's currently selected default audio output device, at however many positions are specified in _FacetPattern_, as the global transport steps through a whole note. If you want to use a different audio output device with Facet, simply select it as your computer's default audio output device.
	- _FacetPattern_ should contain floating-point numbers between 0 and 1, corresponding to the relative point in the transport between 0 and 1 when the generated audio should play, given the number of steps.
	- With no arguments, the command will regenerate at point 0, i.e. at the beginning of each whole note. You can supply a number, array, or FacetPattern as the argument.
	- By default, the FacetPattern will continue to regenerate and play. To prevent it from regenerating, include a `keep()` operation. To stop playback, use the key command `[ctrl + .]` or press the stop button "■".
	- example:
		- `$('example').randsamp().play();	// plays once at beginning of loop`
		- `$('example').randsamp().play(0.5);	// plays once at middle point`
		- `$('example').randsamp().play(_.noise(4));	// plays once at 4 random steps`
---
- **record** ( _filename_, _length_in_samples_, _input_channel_ = 1)
	- records a monophonic wav file into the `tmp` directory named `filename.wav`. The recorded wav file can then be loaded into FacetPatterns via the `.sample()` method. The file is recorded at 32-bit floating-point bit depth, at the sample rate configured in `config.js`.
	- The `input_channel` corresponds to that channel on your computer's currently selected default audio input device. If you want to use a different audio input device with Facet, simply select it as your computer's default audio input device.
	- **NOTE**: This method does not generate data in the FacetPattern where it's running; it records and saves a wav file which must then be loaded into a FacetPattern via the `.sample()` method.
	- example:
		- `$('a').record('test123',n16).sample('test123').play(_.ramp(0,1,16)); // each loop, record a sample 1/16th the loop size named test123.wav and play back the recording from the previous loop 16 times`

### MIDI / OSC output
You might need to activate a MIDI driver on your machine in order to send MIDI from Facet to a DAW. If Facet finds no MIDI drivers, the dropdown select UI in the browser will be empty, and if you try the below commands they will produce no output. Google "install MIDI driver {your OS goes here}" for more information.

- **note** ( _VelocityPattern_ = 100, _DurationPattern_ = 125, _channel_ = 1 )
	- sends a MIDI note on/off pair for every value in the FacetPattern's data.
	- The `VelocityPattern` and `DurationPattern` will automatically scale to match the note pattern. This allows you to modulate MIDI velocity and duration over the course of the whole note.
	- The `channel` argument by default sends the MIDI out channel 1. It can be set to any channel between 1-16.
	- example:
		- `$('example').sine(1,32).scale(36,90).round().note();`
		- `$('example').sine(1,random(32,100,1)).scale(36,random(52,100,1)).prob(random()).nonzero().round().note();`
---
- **cc** ( _controller_number_ = 70, _channel_ = 1 )
	- sends a MIDI cc event bound to controller # `controller_number` for every value in the FacetPattern's data.
	- _Note_: This function is automatically scaled into the expected data range for MIDI CC data. It expects a FacetPattern of values between 0 and 1.
	- The `channel` argument by default sends the MIDI out channel 1. It can be set to any channel between 1-16.
	- example:
		- `$('example').drunk(64,0.1).cc();`
---
- **osc** ( _address_ )
	- sends a packet of OSC data to OSC address `address` for every value in the FacetPattern's data.
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
		- `$('example').sine(1,128).pitchbend();`

### Methods for controlling transport steps & BPM

- **bpm** ( )
	- stores the FacetPattern data in the transport as BPM values to be cycled through over each loop.
	- example:
		- `$('example').from([20,40,80,160,320]).shuffle().bpm(); // each loop will be all 5 of these BPM, randomly ordered`
---
- **steps** ( )
	- stores the FacetPattern data as the number of transport steps at any given point in time during each loop. When number of steps changes, the transport recalculates its speed.
	- example:
		- `$('example').ramp(4,128,64).steps(); // go from 4 steps/loop speed to 64 steps/loop speed, over the course of the loop`

### Single number generators
- **choose** ( _pattern_ )
	- returns a randomly selected value from a supplied array.
	- example:
		- `$('example').sine(choose([10,200,1000]),40).play(); // sine wave with either 10, 200, or 1000 cycles`
---
- **ms** ( _milliseconds_ )
	- converts the supplied `milliseconds` value to that many samples, at whatever sample rate the user has configured.
	- example:
		- `$('example').sine(50,40).size(ms(5)).play(); // 5ms sine wave`
		- `$('example').sine(50,40).size(ms(50)).play(); // 50ms sine wave`
---
- **random** ( _min_ = 0, _max_ = 1, _int_mode_ = 0 )
	- returns a random number between `min` and `max`. If `int_mode` = 1, returns an integer. Otherwise, returns a float by default.
	- example:
		- `$('example').sine(random(1,1000,1),40).play(); // a sine wave with 1 - 1000 cycles`

### FacetPattern generators
- **binary** ( _integer_, _length_)
	- Computes the binary representation of `integer`. If `length` is not present, the output FacetPattern will be the actual length of the binary representation of `integer`.
	- example:
		- `$('example').binary(8); // 1000`
		- `$('example').binary(490321,13); // 1110111101101: truncated at 13 values`
		- `$('example').binary(8,12); // 000000001000: padded with 0s`
---
- **cosine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `$('example').cosine(2,30); // 2 cycles, 30 values each`
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
- **from** ( _pattern_ )
	- allows the user to specify their own pattern. **Note the array syntax!**
	- example:
		- `$('example').from([1,2,3,4]);`
---
- **get** ( _name_ )
	- retrieves a FacetPattern previously stored in memory by a `.set()` command. **NOTE**: You cannot run `.get()` in the same block of commands where the pattern was initially stored via `.set()`.
		- example:
		- `$('example').randsamp().set('my_pattern'); // first, set a random sample, in a separate command`
		- `$('example').get('my_pattern').reverse().dup(1).play(); // then in a new command, run this`
---
- **noise** ( _length_ )
	- generates a random series of values between9 0 and 1 for `length`.
	- example:
		- `$('example').noise(1024);`
---
- **phasor** ( _periods_, _length_ )
	- ramps from 0 to 1 for `periods` periods, each period having length `length`.
	- example:
		- `$('example').phasor(10,100); // 10 ramps`
---
- **ramp** ( _from_, _to_, _size_ )
	- moves from `from` to `to` over `size` values.
	- example:
		- `$('example').ramp(250,100,1000); // go from 250 to 100 over 1000 values`
---
- **set** ( _name_ )
	- stores a FacetPattern in memory for temporary reference in future operations. **NOTE**: You cannot run `.get()` in the same block of commands where the pattern was initially stored via `.set()`. Any FacetPatterns stored via `.set()` will only be stored until the server is closed.
		- example:
		- `$('example').noise(32).set('my_pattern');`
---
- **sine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `$('example').cosine(2,30); // 2 cycles, 30 values each`
---
- **spiral** ( _length_, _degrees_ = 137.5 )
	- generates a spiral of length `length` of continually ascending values in a circular loop between 0 and 1, where each value is `degrees` away from the previous value. `degrees` can be any number between 0 and 360. By default `degrees` is set to 137.5 which produces an output pattern similar to branching leaves, where each value is as far away as possible from the previous value.
	- example:
		- `$('example').sine(1,1000).times(_.spiral(1000,random(1,360))); // an interesting, modulated sine wave`
		- `$('example').spiral(100); // defaults to a Fibonacci leaf spiral`
---
- **square** ( _periods_, _length_ )
	- generates a square wave (all 0 and 1 values) for `periods` periods, each period having `length` values.
	- example:
		- `$('example').square(5,6); // 5 cycles, 6 values each`
---
- **turing** ( _length_ )
	- generates a pattern of length `length` with random 1s and 0s.
	- example:
		- `$('example').turing(64); // instant rhythmic triggers`
- **tri** ( _periods_, _length_ )
	- generates a triangle wave for `periods` periods, each period having `length` values.
	- example:
		- `$('example').triangle(30,33); // 30 cycles, 33 values each`

### FacetPattern modulators
- **abs** ( )
	- returns the absolute value of all numbers in the FacetPattern.
	- example:
		- `$('example').sine(1,100).offset(-0.3).abs(); // a wonky sine`
---
- **at** ( _position_, _value_ )
	- replaces the value of a FacetPattern at the relative position `position` with `value`.
	- example:
		- `$('example').turing(16).at(0,1); // the 1st value of the 16-step Turing sequence (i.e. 0% position) is always 1`
		- `$('example').turing(16).at(0.5,2); // the 9th value of the 16-step Turing sequence (i.e. 50% position) is always 2`
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
- **curve** ( _tension_ = 0.5, _segments_ = 25 )
	- returns a curved version of the FacetPattern. Tension and number of segments in the curve can be included but default to 0.5 and 25, respectively.
	- example:
		- `$('example').noise(16).curve();				// not so noisy`
		- `$('example').noise(16).curve(0.5, 10);	// fewer segments per curve`
		- `$('example').noise(16).curve(0.9);			// different curve type`
---
- **distavg** ( )
	- computes the distance from the average of the FacetPattern, for each element in the FacetPattern.
	- example:
		- `$('example').from([0.1,4,3.14]).distavg(); // -2.3133 1.5867 0.7267`
---
- **dup** ( _num_ )
	- duplicates the FacetPattern `num` times.
	- example:
		- `$('example').sine(1,100).dup(random(2,4,1)); // sine has 2, 3, or 4 cycles `
---
- **echo** ( _num_, _feedback_ = 0.666 )
	- repeats the FacetPattern `num` times, with amplitude multiplied by `feedback` each repeat.
	- example:
		- `$('example').from([1]).echo(5); // 1 0.666 0.4435 0.29540 0.19674 0.13103`
		- `$('example').phasor(5,20).echo(8); // phasor decreases after each 5 cycles `
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
	- example:
		- `$('example').from([1,0,1,1]).fft(); // 3 0 0 1 1 0 0 -1`
---
- **flipAbove** ( _maximum_ )
	- for all values above `maximum`, it returns `maximum` minus how far above the value was.
	- example:
		- `$('example').sine(1,1000).flipAbove(0.2); // wonky sine`
---
- **flipBelow** ( _min_ )
	- for all values below `minimum`, it returns `minimum` plus how far below the value was.
	- example:
		- `$('example').sine(1,1000).flipBelow(0.2); // inverse wonky sine`
---
- **flattop** ( )
	- applies a flat top window to the FacetPattern, which a different flavor of fade.
	- example:
		- `$('example').noise(1024).flattop();`
---
- **fracture** ( _pieces_ )
	- divides and scrambles the FacetPattern into `pieces` pieces.
	- example:
		- `$('example').phasor(1,1000).fracture(100); // the phasor has shattered into 100 pieces!`
---
- **gain** ( _amt_ )
	- multiplies every value in the FacetPattern by a number.
	- example:
		- `$('example').from([0,1,2]).gain(100); // 0 100 200`
		- `$('example').from([0,1,2]).gain(0.5); // 0 0.5 1`
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
- **keep** (  )
	- preserve the generated FacetPattern so that it plays each loop. Without including `keep()`, the FacetPattern will regenerate each loop by default.
	- example:
		- `$('example').sine(random(10,500,1),50).keep().play();`
---
- **ifft** ( )
	- computes the IFFT of the FacetPattern. Typically it would be used to reconstruct a FacetPattern after it had been translated into "phase data". But you can run an IFFT on any data.
	- example:
		- `$('example').randsamp().fft().shift(0.2).ifft().play(); // FFT bin shifting`
---
- **interp** ( _weight_ = 0.5, _name_ )
	- interpolates the FacetPattern with a FacetPattern previously stored in memory by a `.set()` command. A weight of 0.5 gives equal weight to both patterns. **NOTE**: You cannot run `.interp()` in the same block of commands where the pattern was initially stored via `.set()`.
		- example:
		- `$('example').randsamp().set('mypattern');  // first in one command, set a random sample`
		- `$('example').sine(100,350).interp(0.5,_.get('mypattern')).play(); // then in a second command, 50% interpolate with a sine wave`
---
- **invert** ( )
	- computes the `minimum` and `maximum` values in the FacetPattern, then scales every number to the opposite position, relative to `minimum` and `maximum`.
	- example:
		- `$('example').from([0,0.1,0.5,0.667,1]).invert(); // 1 0.9 0.5 0.333 0`
---
- **iter** ( _num_times_, _commands_ = function(), _prob_ = 1 )
	- A shorthand for rerunning a certain command over and over, with prob as a float between 0 and 1 controlling the likelihood that the code actually runs. You can refer to the current iteration of the algorithm via the reserved word: `this` (see example).
	- example:
		- `$('example').randsamp().iter(8,()=>{this.delay(random(1,2000))}).scale(-1,1).play(); // 8 delay lines between 1 and 2000 samples`
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
- **log** ( _base_, _direction_ )
	- stretches a FacetPattern according to a logarithmic curve `base`, where the values at the end can be stretched for a significant portion of the FacetPattern, and the values at the beginning can be squished together. If `direction` is negative, returns the FacetPattern in reverse.
	- example:
		- `$('example').ramp(1,0,1000).log(100); // a logarithmic curve from 1 to 0`
---
- **lpf** ( _cutoff_ )
	- applies a simple low pass filter to the FacetPattern.
	- example:
		- `$('example').noise(n1).lpf(random(1,1000)); // low-passed noise`
---
- **modulo** ( _amt_ )
	- returns the modulo i.e. `% amt` calculation for each value in the FacetPattern.
	- example:
		- `$('example').from([1,2,3,4]).modulo(3); // 1 2 0 1`
---
- **normalize** ( )
	- scales the FacetPattern to the 0 - 1 range.
	- example:
		- `$('example').sine(1,100).gain(4000).normalize(); // the gain is undone!`
		- `$('example').sine(1,100).scale(-1, 1).normalize(); // works with negative values`
---
- **nonzero** ( )
	- replaces all instances of 0 with the previous nonzero value. Useful after with probability controls, which by default will set some values to 0. Chaining a nonzero() after that would replace the 0s with the other values the pattern. Particularly in a MIDI context with .prob(), you probably don't want to send MIDI note values of 0, so this will effectively sample and hold each nonzero value, keeping the MIDI note values in the expected range.
	- example:
		- `$('example').from([1,2,3,4]).prob(0.5).nonzero(); // if 2 and 4 are set to 0 by prob(0.5), the output of .nonzero() would be 1 1 3 3`
---
- **offset** ( _amt_ )
	- adds `amt` to each value in the FacetPattern.
	- example:
		- `$('example').sine(4,40).offset(-0.2); // sine's dipping into negative territory`
---
- **palindrome** ( )
	- returns the original FacetPattern plus the reversed FacetPattern.
	- example:
		- `$('example').from([0,1,2,3]).palindrome(); // 0 1 2 3 3 2 1 0`
---
- **pong** ( _min_, _max_ )
	- folds FacetPattern values greater than `max` so their output continues at `min`.  If the values are twice greater than `max`, their output continues at `min` again. Similar for values less than `min`, such that they wrap around the min/max thresholds.
	- if no value is entered for `max`, then the first argument will be used to create the `min` and `max`, centered around 0. For instance, `pong(0.3) == pong(-0.3,0.3)`
	- example:
		- `$('example').sine(1,1000).offset(-0.1).pong(0.2,0.5);`
---
- **pow** ( _expo_, _direction_ = 1 )
	- stretches a FacetPattern according to an exponential power `expo`, where the values at the beginning can be stretched for a significant portion of the FacetPattern, and the values at the end can be squished together. If `direction` is negative, returns the FacetPattern in reverse.
	- example:
		- `$('example').sine(5,200).pow(6.5); // squished into the end`
		- `$('example').sine(5,200).pow(6.5,-1) // squished at the beginning`
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
- **recurse** ( _prob_ )
	- randomly copies portions of the FacetPattern onto itself, creating nested, self-similar structures. `prob` (float 0-1) sets the likelihood of each value running a recursive copying process.
	- example:
		- `$('example').noise(128).recurse(0.7); // remove the recurse to hear the difference `
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
- **reverse** ( )
	- returns the reversed FacetPattern.
	- example:
		- `$('example').phasor(1,1000).reverse(); // go from 1 to 0 over 1000 values`
---
- **round** (  )
	- rounds all values in the FacetPattern to an integer.
	- example:
		- `$('example').from([0.1,0.5,0.9,1.1]).round(); // 0 1 1 1`
---
- **saheach** ( _n_ )
	- samples and holds every `nth` value in the FacetPattern.
	- example:
		- `$('example').phasor(1,20).saheach(2); // 0 0 0.1 0.1 0.2 0.2 0.3 0.3 0.4 0.4 0.5 0.5 0.6 0.6 0.7 0.7 0.8 0.8 0.9 0.9`
---
- **saturate** ( _gain_ )
	- runs nonlinear waveshaping (distortion) on the FacetPattern, always returning values between -1 and 1.
	- example:
		- `$('example').phasor(1,20).gain(10).saturate(6); // 0 0.995 0.9999 0.99999996 0.9999999999 0.999999999999 0.9999999999999996 1 1 1 1 1 1 1 1 1 1 1 1 1`
---
- **saveAs** ( _filename_ )
	- creates a new wav file in the `samples/` directory or a sub-directory containing the FacetPattern. **NOTE**: the directory must already exist.
	- example:
		- `$('example').iter(6,()=>{this.append(_.sine(random(1,40,1),100)).saveAs('/myNoiseStuff/' + Date.now()`)}); // creates 6 wav files in the myNoiseStuff directory. Each filename is the UNIX timestamp to preserve order.`
---
- **scale** ( _new_min_, _new_max_ )
	- moves the FacetPattern to a new range, from `new_min` to `new_max`. **NOTE**: this function will return the average of new_min and new_max if the FacetPattern is only 1 value long. since you cannot interpolate where the value would fall in the new range, without a larger FacetPattern to provide initial context of the value's relative position. This operation works better with sequences larger than 3 or 4.
	- if no value is entered for `new_max`, then the first argument will be used to create the `new_min` and `new_max`, centered around 0. For instance, `scale(1) == scale(-1,1)`
	- example:
		- `$('example').sine(10,100).scale(-1,1); // bipolar signal`
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
- **slices** ( _num_slices_, _commands_ = function, _prob_ = 1 )
	- slices the FacetPattern into `num_slices` slices, and for `prob` percent of those slices, runs `commands`, appending all slices back together. You can refer to the current slice of the algorithm via the reserved word: `this` (see example).
	- example:
		- `$('example').randsamp().slices(32,()=>{this.fft().shift(random()).ifft()}).play();`
---
- **smooth** ( )
	- interpolates each value so it falls exactly between the values that precede and follow it.
	- example:
		- `$('example').noise(64).smooth(); // less noisy`
---
- **sometimes** (_prob_, _operations_)
	- runs a chain of operations only some of the time, at a probability set by `prob`.
	- example:
		- `$('example').phasor(1,100).sticky(0.5).scale(40,80).sometimes(0.5,()=>this.reverse());`
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
		- `$('example').sine(1,1000).sticky(0.98); // glitchy sine`
---
- **subset** ( _percentage_ )
	- returns a subset of the FacetPattern with `percentage`% values in it.
	- example:
		- `$('example').phasor(1,50).subset(0.3); // originally 50 values long, now 0.02 0.08 0.50 0.58 0.62 0.700 0.76 0.78 0.92`
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
### Pattern modulators with a second pattern as argument
- **add** ( _FacetPattern_, _match_sizes_ = false )
	- adds the first FacetPattern and the second FacetPattern. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1,100).add(_.from([0.5,0.25,0.1,1]));`
- **and** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical AND of both FacetPattern, returning a 0 if one of the values is 0 and returning a 1 if both of the values are nonzero. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').from([1,0,1,0]).and(_.from([0,1])); // 0 0 1 0`
---
- **append** ( _FacetPattern_ )
	- appends the second FacetPattern onto the first.
	- example:
		- `$('example').sine(1,100).append(_.phasor(1,100)).append(_.from([1,2,3,4]));`
---
- **chaos** ( _FacetPattern_, _iterations_ = 100, _cx_ = 0, _cy_ = 0)
	- each piece of data in the FacetPattern is paired with the corresponding value in the second FacetPattern. The resulting complex number x,y coordinate is run through a function: f(x) = x2 + c, over `iterations` iterations. The output is a value between 0 and 1, which corresponds to how stable or unstable that particular point is in the complex number plane.
	- By default, both cx and cy are set to 0 (Mandelbrot set). But you can set them to other values from -1 to 1, which can produce all sorts of Julia set variations.
	- example: `$('example').sine(n1/1000,1000).chaos(_.drunk(n1,0.01)).play()`
---
- **convolve** ( _FacetPattern_ )
	- computes the convolution between the two FacetPatterns.
	- example:
		- `$('example').randsamp().convolve(_.randsamp()).play();	// convolving random samples`
---
- **divide** ( _FacetPattern_, _match_sizes_ = false )
	- divides the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1,100).divide(_.from([0.5,0.25,0.1,1]));`
---
- **equals** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical EQUALS of both FacetPattern, returning a 0 if the values don't equal each other and returning a 1 if they do. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1,100).equals(_.sine(2,100)); // two sine waves phasing`
---
- **ichunk** ( _FacetPattern_ )
	- slices the input into `FacetPattern.length` windowed chunks (to avoid audible clicks). Loops through every value of `FacetPattern` as a lookup table, determining which ordered chunk of audio from the input sequence it corresponds to, and appends that window to the output buffer.
	- example:
		- `$('example').randsamp().ichunk(_.ramp(0,0.5,256)).play(); // play 256 slices between point 0 and 0.5 of randsamp()... timestretching :)`
		- `$('example').noise(4096).sort().ichunk(_.noise(256).sort()).play(); // structuring noise with noise`
---
- **interlace** ( _FacetPattern_ )
	- interlaces two FacetPatterns. If one FacetPattern is smaller, it will be interspersed evenly throughout the other FacetPattern.
	- example:
		- `$('example').sine(1,100).interlace(_.phasor(1,20));`
---
- **map** ( _FacetPattern_ )
	- forces all values of the input FacetPattern to be mapped onto a new set of values from a second FacetPattern.**
	- example:
		- `$('example').from([1,2,3,4]).map([11,12,13,14]); // 11 11 11 11`
		- `$('example').from([1,2,3,4]).scale(30,34).map(_.from([31,31.5,32,32.5])); // 31 31.5 32.5 32.5`
---
- **mix** ( _wet_, _command_, _match_sizes_ = false )
	- Mixes the input FacetPattern with a second FacetPattern generated by `command`. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').randsamp().mix(0.5,()=>{this.reverse().speed(0.5).echo(8).speed(0.1)}).play();`
---
- **or** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical OR of both FacetPattern, returning a 0 if both of the values are 0 and returning a 1 if either of the values are nonzero. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').from([1,0,1,0]).or(_.from([0,1])); // 1 0 1 1`
---
- **sieve** ( _FacetPattern_ )
	- uses the second FacetPattern as a lookup table, with each value's relative value determining which value from the input sequence to select.
	- example:
		- `$('example').noise(1024).sieve(_.sine(10,1024)); // sieving noise with a sine wave into the audio rate :D`
---
- **subtract** ( _FacetPattern_, _match_sizes_ = false )
	- subtracts the second FacetPattern from the first. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1,100).subtract(_.from([0.5,0.25,0.1,1]));`
---
- **times** ( _FacetPattern_, _match_sizes_ = false)
	- multiplies the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1,100).times(_.from([0.5,0.25,0.1,1]));`

### Audio operations

Facet can load audio samples (.wav files) as FacetPatterns and run arbitrary operations on them.

 To prevent humongous computations, there are some guardrails, but even so, audio processing can increase your computer's CPU load quite a bit, and it is possible that you accidentally run a command that requires more computing power than your computer can handle in real time. Of course, if you're just running the command for sound design or testing purposes, you can just wait for it to complete and hear what it comes up with. But if the CPU% indicator goes way up, or the server seems to not be responding, just stop and restart the node server in your terminal, and try tailoring the audio commands so they are within the limitations of your machine.

 - **allpass** ( )
 	- runs the audio through an allpass filter.
 	- example:
 		- `$('example').randsamp().iter(12,()=>{this.allpass().delay(random(1,6000))}).scale(-1,1).play(); // reverb :)`
 ---
- **audio** ( )
	- removes any DC offset via a high-pass biquadratic filter at ~0Hz.
	- example:
		- `$('example').randsamp().times(_.noise(4)).audio().play();`
---
- **delay** ( _samples_, _wet_ = 0.5 )
	- delays the input FacetPattern by `samples` samples. You can crossfade between the original and delayed copies with `wet`.
	- example:
		- `$('example').randsamp().delay(random(1700,10000)).play();`
---
- **file** ( _filename_ )
	- loads the raw data of any file inside the `files/` directory into memory. You can supply any file type, not just images.
	- example:
		- `$('example').file('my_image.png').play(); // if my_image.png is in the files directory, this will play the file's raw data. NOTE: this could be very noisy!`
- **mutechunks** ( _chunks_, _prob_ )
	- slices the input FacetPattern into `chunks` chunks and mutes `prob` percent of them.
	- example:
		- `$('example').randsamp().mutechunks(16,0.33).play();	// 33% of 16 audio slices muted`
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
- **sample** ( _filename_ )
	- loads a wav file from the `samples/` directory into memory. You can specify other subdirectories inside the Facet repo as well. The `.wav` can be omitted from _filename_; in this case `.wav` it will be automatically appended to _filename_.
	- example:
		- `$('example').sample('1234').play(); // if 1234.wav is in the samples directory, you're good to go`
		- `$('example').sample('./myfolder/myfile.wav'); // or point to the file with a relative path`
---
- **size** ( _new_size_ )
	- upscales or downscales the FacetPattern prior to playback, so its length is `new_size` samples.
	- example:
		- `$('example').noise(1000).size(n1).play(); // upscaling 1000 samples of noise to be 1 second long. lo-fi noise`
---
- **suspend** ( _start_pos_, _end_pos_ )
	- surrounds the FacetPattern with silence, so that the entire input FacetPattern still occurs, but only for a fraction of the overall resulting FacetPattern. The smallest possible fraction is 1/8 of the input FacetPattern, to safeguard against generating humongous and almost entirely empty wav files.
	- example:
		- `$('example').randsamp().suspend(0.25,0.75).play();	// the input pattern is now squished into the middle 50% of the buffer`
