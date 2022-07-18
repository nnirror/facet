## Overview

Facet is an open-source live coding system for algorithmic music. With a code editor in the browser and a NodeJS server running locally on your machine, Facet can generate and sequence audio and MIDI data in real-time.

## Getting started

1. Install Node.js and npm: https://www.npmjs.com/get-npm
2. Download the Facet repo.
3. In a terminal, navigate to the root of the Facet repository, and run `npm install`.
4. After the previous command completes, run `npm run facet`. The server should start running, and it should open up a new browser window with the code editor.
5. Copy this command into the code editor in the browser: `_.sine(100,200).play();` Move your cursor so it's on the line. Hit `[ctrl + enter]` to run the command. The code editor application will always briefly highlights to illustrate what command(s) ran. You should hear a sine wave playing out of your computer's default sound card.

## Facet commands

### Syntax

Facet commands are based entirely around JavaScript, using a custom class called a `FacetPattern`. In order to produce audio or MIDI output, simply create an instance of a FacetPattern, and run some methods:

`new FacetPattern().sine(100,200).play();`

There are two shorthands for creating a new instance of a `FacetPattern`:

`new $('my_sine').sine(100,200).play(); // named my_sine`
`_.sine(100,200).play();								// no name	                 `

Next, translate that data:

`_.sine(100,200).gain(random()).play();`
`// each time you run ^, the same sine wave at a different volume`

Certain operations (e.g. `sometimes()`, `iter()`, `slices()`) allow you to supply functions as arguments:

`_.iter(16,1,()=>{this.append(_.randsamp().speed(0.1))}).play();`
`// stitches together 16 random samples, each playing at 10x normal speed, and play back the result one time`

### UI controls in the browser

Below the text editor, there are several UI elements which control the Facet server running in the background. Moving from left to right:

- Server connection status indicator (green = online; red = offline)
- CPU% indicator
- Slider for setting the BPM of the global transport
- Slider for setting the number of steps in a whole note
- MIDI output selector / refresh button
- ▶ = start global transport
- ■ = stop global transport
- ↵ = rerun the block of code wherever the cursor is
- ⊖ = clear all event hooks. More information on event hooks is in the `.on()` function documentation below.

### Keyboard shortcuts

- Run command(s): `[ctrl + enter]`. All commands not separated by multiple newlines will run together.
- Stop the transport and clear all hooks (effectively a global mute): `[ctrl + m]`
- Clear all hooks, but continue the transport: `[ctrl + c]`
- Mute/unmute hooks: `[ctrl + f]`

### Variables

#### mousex / mousey

Both `mousex` and `mousey`, as floating-point number representations of your cursor's position _in the browser window_, are available for use in commands, e.g.:

```
_.sine(100,200).gain(mousey); // cursor y position controls volume every time the code runs
```

## Command reference

### Rerunning commands
- **on** ( _FacetPattern_ = 0, _every_n_times_ = 1 )
	- Reruns the command at however many positions are specified in _FacetPattern_, as the global transport steps through a whole note.
	- _FacetPattern_ should contain floating-point numbers between 0 and 1, corresponding to the relative point in the transport between 0 and 1 when the code should rerun, given the number of steps.
	- With no first argument, the command will regenerate at point 0, i.e. at the beginning of each whole note. You can supply a number, array, or FacetPattern as the first argument.
	- With no second argument, the command will regenerate at the beginning of each whole note. When a second argument is present, the command will only regenerate every `n` whole notes.
	- Hit `[ctrl + c]` to delete all hooks. You should see a message indicate successful deletion in the browser.
	- Hit `[ctrl + f]` to toggle between muting and un-muting all hooks. You should see a message indicating the current status in the browser.
	- example:
		- `_.randsamp().play().on() // play new sample at the beginning of every whole note`
		- `_.randsamp().play().on(_.noise(4)) // play new sample at 4 random times throughrought every whole note`
		- `_.randsamp().play().on(_.choose(0,0.125,0.25,0.375,0.5,0.625,0.75,0.875)) // play new sample at 8 geometrically related times throughout every note`
---

### Audio output
- **play** ( _FacetPattern_ )
	- plays the FacetPattern as audio to your computer's default sound card, at however many positions are specified in _FacetPattern_, as the global transport steps through a whole note.
	- _FacetPattern_ should contain floating-point numbers between 0 and 1, corresponding to the relative point in the transport between 0 and 1 when the generated audio should play, given the number of steps.
	- With no arguments, the command will regenerate at point 0, i.e. at the beginning of each whole note. You can supply a number, array, or FacetPattern as the argument.
	- Whereas `repeat()` will continually loop playback, `play()` only runs a single time.
	- example:
		- `_.randsamp().play();	// plays once at beginning of loop`
		- `_.randsamp().play(0.5);	// plays once at middle point`
		- `_.randsamp().play(_.noise(4));	// plays once at 4 random steps`
---
- **repeat** ( _FacetPattern_ )
	- continually plays the sequence at whatever positions were specified, each time the transport moves through a whole note.
	- _FacetPattern_ should contain floating-point numbers between 0 and 1, corresponding to the relative point in the transport between 0 and 1 when the generated audio should play, given the number of steps.
	- With no arguments, the command will regenerate at point 0, i.e. at the beginning of each whole note. You can supply a number, array, or FacetPattern as the argument.
	- **Note:** if you want to use `on()` with `repeat()`, you will need to give your FacetPattern a name, e.g. `new $('name_goes here')`.
	- example:
	- `_.randsamp().repeat();	// repeats, starting at beginning of loop`
	- `_.randsamp().repeat(0.5);	// repeats, starting at middle point`
	- `new $('name_goes_here').randsamp().repeat(_.noise(4)).on();	// note how the FacetPattern is named`

### MIDI output
You might need to activate a MIDI driver on your machine in order to send MIDI from Facet to a DAW. If Facet finds no MIDI drivers, the dropdown select UI in the browser will be empty, and if you try the below commands they will produce no output. Google "install midi driver {your OS goes here}" for more information.

- **note** ( _VelocityPattern_ = 100, _DurationPattern_ = 125, _channel_ = 0 )
	- sends a MIDI note on/off pair for every value in the FacetPattern's data.
	- The VelocityPattern and DurationPatterns will automatically scale to match the note pattern. This allows you to modulate MIDI velocity and duration over the course of the whole note.
	- The `channel` argument by default sends the MIDI out all channels (channel 0). It can be set to any channel between 1-16.
	- example:
		- `_.sine(1,32).scale(36,90).round().note();`
		- `_.sine(1,random(32,100,1)).scale(36,random(52,100,1)).prob(random()).nonzero().round().note().on();`
---
- **cc** ( _controller_number_ = 70, _channel_ = 0 )
	- sends a MIDI cc event bound to controller # `controller_number` for every value in the FacetPattern's data.
	- _Note_: This function is automatically scaled into cc data, so you can supply it a FacetPattern between 0 and 1.
	- The `channel` argument by default sends the MIDI out all channels (channel 0). It can be set to any channel between 1-16.
	- example:
		- `_.drunk(64,mousey).cc().on();`
---
- **pitchbend** ( _channel_ = 0 )
	- sends a MIDI pitch bend event for every value in the FacetPattern's data.
	- The `channel` argument by default sends the MIDI out all channels (channel 0). It can be set to any channel between 1-16.
	- _Note_: This function is automatically scaled into pitch bend data, so you can supply it a FacetPattern between 0 and 1.
	- example:
		- `_.pitchbend(64,random()).scale(0,127).cc();`

### Single number generators
- **choose** ( _pattern_ )
	- returns a randomly selected value from a supplied array.
	- example:
		- `_.sine(choose([2,3,4]),40); // sine wave with either 2, 3, or 4 cycles`
---
- **random** ( _min_ = 0, _max_ = 1, _int_mode_ = 0 )
	- returns a random number between `min` and `max`. If `int_mode` = 1, returns an integer. Otherwise, returns a float by default.
	- example:
		- `_.sine(random(1,100,1),40) // a sine wave with 1 - 100 cycles`
---
### FacetPattern generators
- **binary** ( _integer_, _length_)
	- Computes the binary representation of `integer`. If `length` is not present, the output FacetPattern will be the actual length of the binary representation of `integer`.
	- example:
		- `_.binary(8); // 1000`
		- `_.binary(490321,13); // 1110111101101: truncated at 13 values`
		- `_.binary(8,12); // 000000001000: padded with 0s`
---
- **cosine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `_.cosine(2,30); // 2 cycles, 30 values each`
---
- **drunk** ( _length_, _intensity_ )
	- generates a random walk of values between 0 and 1 for `length` values. `intensity` controls how much to add.
	- example:
		- `_.drunk(16,0.1); // slight random movement`
---
- **from** ( _pattern_ )
	- allows the user to specify their own pattern. **Note the array syntax!**
	- example:
		- `_.from([1,2,3,4]);`
---
- **noise** ( _length_ )
	- generates a random series of values between9 0 and 1 for `length`.
	- example:
		- `_.noise(1024); // lots of randomness`
---
- **phasor** ( _periods_, _length_ )
	- ramps from 0 to 1 for `periods` periods, each period having length `length`.
	- example:
		- `_.phasor(10,100); // 10 ramps`
---
- **ramp** ( _from_, _to_, _size_ )
	- moves from `from` to `to` over `size` values.
	- example:
		- `_.ramp(250,100,1000); // go from 250 to 100 over 1000 values`
---
- **sine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `_.cosine(2,30); // 2 cycles, 30 values each`
---
- **spiral** ( _length_, _degrees_ = 137.5 )
	- generates a spiral of length `length` of continually ascending values in a circular loop between 0 and 1, where each value is `degrees` away from the previous value. `degrees` can be any number between 0 and 360. By default `degrees` is set to 137.5 which produces an output pattern similar to branching leaves, where each value is as far away as possible from the previous value.
	- example:
		- `_.sine(1,1000).times(_.spiral(1000,random(1,360))); // an interesting, modulated sine wave`
		- `_.spiral(100); // defaults to a Fibonacci leaf spiral`
---
- **square** ( _periods_, _length_ )
	- generates a square wave (all 0 and 1 values) for `periods` periods, each period having `length` values.
	- example:
		- `_.square(5,6); // 5 cycles, 6 values each`
---
- **turing** ( _length_ )
	- generates a pattern of length `length` with random 1s and 0s.
	- example:
		- `_.turing(64); // instant rhythmic triggers`
- **tri** ( _periods_, _length_ )
	- generates a triangle wave for `periods` periods, each period having `length` values.
	- example:
		- `_.triangle(30,33); // 30 cycles, 33 values each`
---
### FacetPattern modulators
- **abs** ( )
	- returns the absolute value of all numbers in the FacetPattern.
	- example:
		- `_.sine(1,100).offset(-0.3).abs(); // a wonky sine`
---
- **at** ( _position_, _value_ )
	- replaces the value of a FacetPattern at the relative position `position` with `value`.
	- example:
		- `_.turing(16).at(0,1); // the 1st value of the 16-step Turing sequence (i.e. 0% position) is always 1`
		- `_.turing(16).at(0.5,2); // the 9th value of the 16-step Turing sequence (i.e. 50% position) is always 2`
---
- **changed** ( )
	- returns a 1 or 0 for each value in the FacetPattern. If the value is different than the previous value, returns a 1. Otherwise returns a 0. (The first value is compared against the last value in the FacetPattern.)
	- example:
		- `_.from([1,1,3,4]).changed(); // 1 0 1 1`
---
- **clip** ( _min_, _max_ )
	- clips any numbers in the FacetPattern to a `min` and `max` range.
	- example:
		- `_.from([1,2,3,4]).clip(2,3); // 2 2 3 3 `
---
- **curve** ( _tension_ = 0.5, _segments_ = 25 )
	- returns a curved version of the FacetPattern. Tension and number of segments in the curve can be included but default to 0.5 and 25, respectively.
	- example:
		- `_.noise(16).curve();				// not so noisy`
		- `_.noise(16).curve(0.5, 10);	// fewer segments per curve`
		- `_.noise(16).curve(0.9);			// different curve type`
---
- **distavg** ( )
	- computes the distance from the average of the FacetPattern, for each element in the FacetPattern.
	- example:
		- `_.from([0.1,4,3.14]).distavg(); // -2.3133 1.5867 0.7267`
---
- **dup** ( _num_ )
	- duplicates the FacetPattern `num` times.
	- example:
		- `_.sine(1,100).dup(random(2,4,1)); // sine has 2, 3, or 4 cycles `
---
- **echo** ( _num_, _feedback_ = 0.666 )
	- repeats the FacetPattern `num` times, with amplitude multiplied by `feedback` each repeat.
	- example:
		- `_.from([1]).echo(5); // 1 0.666 0.4435 0.29540 0.19674 0.13103`
		- `_.phasor(5,20).echo(8); // phasor decreases after each 5 cycles `
---
- **fade** ( )
	- applies a crossfade window to the FacetPattern, so the beginning and end are faded out.
	- example:
		- `_.noise(1024).fade();`
---
- **fft** ( )
	- computes the FFT of the FacetPattern, translating the FacetPattern data into "phase data" that could theoretically reconstruct it using sine waves.
	- example:
		- `_.from([1,0,1,1]).fft(); // 3 0 0 1 1 0 0 -1`
---
- **flipAbove** ( _maximum_ )
	- for all values above `maximum`, it returns `maximum` minus how far above the value was.
	- example:
		- `_.sine(1,1000).flipAbove(0.2); // wonky sine`
---
- **flipBelow** ( _min_ )
	- for all values below `minimum`, it returns `minimum` plus how far below the value was.
	- example:
		- `_.sine(1,1000).flipBelow(0.2); // inverse wonky sine`
---
- **flattop** ( )
	- applies a flat top window to the FacetPattern, which a different flavor of fade.
	- example:
		- `_.noise(1024).flattop();`
---
- **fracture** ( _pieces_ )
	- divides and scrambles the FacetPattern into `pieces` pieces.
	- example:
		- `_.phasor(1,1000).fracture(100); // the phasor has shattered into 100 pieces!`
---
- **gain** ( _amt_ )
	- multiplies every value in the FacetPattern by a number.
	- example:
		- `_.from([0,1,2]).gain(100); // 0 100 200`
		- `_.from([0,1,2]).gain(0.5); // 0 0.5 1`
---
- **get** ( _name_ )
	- retrieves a FacetPattern previously stored in memory by a `.set()` command. **NOTE**: You cannot run `.get()` in the same block of commands where the pattern was initially stored via `.set()`.
		- example:
		- `_.randsamp().set('my_pattern'); // first, set a random sample, in a separate command`
		- `_.get('my_pattern').dup(1).play() // then in a new command, run these two together`
		- `_.get('my_pattern').dup(3).play() // to play the same sample 2 and 4 times simultaneously`
---
- **gt** ( _amt_ )
	- returns `1` for every value in the FacetPattern greater than `amt` and `0` for all other values.
	- example:
		- `_.from([0.1,0.3,0.5,0.7]).gt(0.6); // 0 0 0 1`
---
- **gte** ( _amt_ )
	- returns `1` for every value in the FacetPattern greater than or equal to `amt` and `0` for all other values.
	- example:
		- `_.from([0.1,0.3,0.5,0.7]).gte(0.5); // 0 0 1 1`
---
- **ifft** ( )
	- computes the IFFT of the FacetPattern. Typically it would be used to reconstruct a FacetPattern after it had been translated into "phase data". But you can run an IFFT on any data.
	- example:
		- `_.randsamp().set('p');_.iter(6,()=>{this.get('p').fft().shift(0.4).ifft().normalize().set('p')}); // iterative bin shifting`
---
- **interp** ( _weight_ = 0.5, _name_ )
	- interpolates the FacetPattern with a FacetPattern previously stored in memory by a `.set()` command. A weight of 0.5 gives equal weight to both patterns. **NOTE**: You cannot run `.interp()` in the same block of commands where the pattern was initially stored via `.set()`.
		- example:
		- `_.randsamp().set('mypattern');  // first in one command, set a random sample`
		- `_.sine(100,350).interp(0.5,_.get('mypattern')).play(); // then in a second command, 50% interpolate with a sine wave`
---
- **invert** ( )
	- computes the `minimum` and `maximum` values in the FacetPattern, then scales every number to the opposite position, relative to `minimum` and `maximum`.
	- example:
		- `_.from([0,0.1,0.5,0.667,1]).invert(); // 1 0.9 0.5 0.333 0`
---
- **iter** ( _num_times_, _commands_ = function(), _prob_ = 1 )
	- A shorthand for rerunning a certain command over and over, with prob as a float between 0 and 1 controlling the likelihood that the code actually runs. You can refer to the current iteration of the algorithm via the reserved word: `this` (see example).
	- example:
		- `_.randsamp().iter(3,1,()=>{this.echo(random(1,30,1),1.2)}).scale(-1,1).lpf(2400); // dubby feedback`
---
- **jam** ( _prob_, _amt_ )
	- changes values in the FacetPattern.  `prob` (float 0-1) sets the likelihood of each value changing. `amt` is how much bigger or smaller the changed values can be. If `amt` is set to 2, and `prob` is set to 0.5 half the values could have any number between 2 and -2 added to them.
	- example:
		- `_.drunk(128,0.05).jam(0.1,0.7); // small 128 step random walk with larger deviations from the jam`
---
- **lt** ( _amt_ )
	- returns `1` for every value in the FacetPattern less than `amt` and `0` for all other values.
	- example:
		- `_.from([0.1,0.3,0.5,0.7]).lt(0.6); // 1 1 0 0`
---
- **lte** ( _amt_ )
	- returns `1` for every value in the FacetPattern less than or equal to `amt` and `0` for all other values.
	- example:
		- `_.from(0.1,0.3,0.5,0.7]).lte(0.5); // 1 1 1 0`
---
- **log** ( _base_, _direction_ )
	- stretches a FacetPattern according to a logarithmic curve `base`, where the values at the end can be stretched for a significant portion of the FacetPattern, and the values at the beginning can be squished together. If `direction` is negative, returns the FacetPattern in reverse.
	- example:
		- `_.ramp(1,0,1000).log(100); // a logarithmic curve from 1 to 0`
---
- **lpf** ( _cutoff_ )
	- applies a simple low pass filter to the FacetPattern.
	- example:
		- `_.noise(44100).lpf(random(1,1000)); // low-passed noise`
---
- **modulo** ( _amt_ )
	- returns the modulo i.e. `% amt` calculation for each value in the FacetPattern.
	- example:
		- `_.from([1,2,3,4]).modulo(3); // 1 2 0 1`
---
- **normalize** ( )
	- scales the FacetPattern to the 0 - 1 range.
	- example:
		- `_.sine(1,100).gain(4000).normalize(); // the gain is undone!`
		- `_sine(1,100).scale(-1, 1).normalize(); // works with negative values`
---
- **nonzero** ( )
	- replaces all instances of 0 with the previous nonzero value. Useful after with probability controls, which by default will set some values to 0. Chaining a nonzero() after that would replace the 0s with the other values the pattern. Particularly in a MIDI context with .prob(), you probably don't want to send MIDI note values of 0, so this will effectively sample and hold each nonzero value, keeping the MIDI note values in the expected range.
	- example:
		- `_.from([1,2,3,4]).prob(0.5).nonzero(); // if 2 and 4 are set to 0 by prob(0.5), the output of .nonzero() would be 1 1 3 3`
---
- **offset** ( _amt_ )
	- adds `amt` to each value in the FacetPattern.
	- example:
		- `_.sine(4,40).offset(-0.2); // sine's dipping into negative territory`
---
- **palindrome** ( )
	- returns the original FacetPattern plus the reversed FacetPattern.
	- example:
		- `_.from([0,1,2,3]).palindrome(); // 0 1 2 3 3 2 1 0`
---
- **pong** ( _min_, _max_ )
	- folds FacetPattern values greater than `max` so their output continues at `min`.  If the values are twice greater than `max`, their output continues at `min` again. Similar for values less than `min`, such that they wrap around the min/max thresholds.
	- if no value is entered for `max`, then the first argument will be used to create the `min` and `max`, centered around 0. For instance, `pong(0.3) == pong(-0.3,0.3)`
	- example:
		- `_.sine(1,1000).offset(-0.1).pong(0.2,0.5); // EZ cool waveform ready to normalize`
---
- **pow** ( _expo_, _direction_ = 1 )
	- stretches a FacetPattern according to an exponential power `expo`, where the values at the beginning can be stretched for a significant portion of the FacetPattern, and the values at the end can be squished together. If `direction` is negative, returns the FacetPattern in reverse.
	- example:
		- `_.sine(5,200).pow(6.5); // squished into the end`
		- `_.sine(5,200).pow(6.5,-1) // squished at the beginning`
---
- **prob** ( _amt_ )
	- sets some values in the FacetPattern to 0. `prob` (float 0-1) sets the likelihood of each value changing.
	- example:
		- `_.from([1,2,3,4]).prob(0.5); // 1 0 3 0 first time it runs`
		- `_.from([1,2,3,4]).prob(0.5); // 0 0 3 4 second time it runs`
		- `_.from([1,2,3,4]).prob(0.5); // 0 2 3 4 third time it runs`
---
- **quantize** ( _resolution_ )
	- returns `0` for every step in the FacetPattern whose position is not a multiple of `resolution`.
	- example:
		- `_.drunk(16,0.5).quantize(4); // 0.5241 0 0 0 0.7420 0 0 0 1.0 0 0 0 0.4268 0 0 0`
---
- **range** ( _new_min_, _new_max_ )
	- returns the subset of the FacetPattern from the relative positions of `new_min` (float 0-1) and `new_max` (float 0-1).
	- example:
		- `_.from([0.1,0.2,0.3,0.4]).range(0.5,1); // 0.3 0.4`
---
- **recurse** ( _prob_ )
	- randomly copies portions of the FacetPattern onto itself, creating nested, self-similar structures. `prob` (float 0-1) sets the likelihood of each value running a recursive copying process.
	- example:
		- `_.noise(128).recurse(0.7); // remove the recurse to hear the difference `
---
- **reduce** ( _new_size_ )
	- reduces the FacetPattern length to `new_size`. If `new_size` is larger than the FacetPattern length, no change.
	- example:
		- `_.from([1,2,3,4]).reduce(2); // 1 3`
---
- **reverse** ( )
	- returns the reversed FacetPattern.
	- example:
		- `_.phasor(1,1000).reverse(); // go from 1 to 0 over 1000 values`
---
- **round** (  )
	- rounds all values in the FacetPattern to an integer.
	- example:
		- `_.from([0.1,0.5,0.9,1.1]).round(); // 0 1 1 1`
---
- **saheach** ( _n_ )
	- samples and holds every `nth` value in the FacetPattern.
	- example:
		- `_.phasor(1,20).saheach(2); // 0 0 0.1 0.1 0.2 0.2 0.3 0.3 0.4 0.4 0.5 0.5 0.6 0.6 0.7 0.7 0.8 0.8 0.9 0.9`
---
- **saturate** ( _gain_ )
	- runs nonlinear waveshaping (distortion) on the FacetPattern, always returning values between -1 and 1.
	- example:
		- `_.phasor(1,20).gain(10).saturate(6); // 0 0.995 0.9999 0.99999996 0.9999999999 0.999999999999 0.9999999999999996 1 1 1 1 1 1 1 1 1 1 1 1 1`
---
- **saveAs** ( _filename_ )
	- creates a new wav file in the `samples/` directory or a sub-directory containing the FacetPattern. **NOTE**: the directory must already exist.
	- example:
		- `_.iter(6,1,()=>{this.append(_.sine(random(1,40,1),100)).saveAs('/myNoiseStuff/' + Date.now()`)}); // creates 6 wav files in the myNoiseStuff directory. Each filename is the UNIX timestamp to preserve order.`
---
- **scale** ( _new_min_, _new_max_ )
	- moves the FacetPattern to a new range, from `new_min` to `new_max`. **NOTE**: this function will return the average of new_min and new_max if the FacetPattern is only 1 value long. since you cannot interpolate where the value would fall in the new range, without a larger FacetPattern to provide initial context of the value's relative position. This operation works better with sequences larger than 3 or 4.
	- if no value is entered for `new_max`, then the first argument will be used to create the `new_min` and `new_max`, centered around 0. For instance, `scale(1) == scale(-1,1)`
	- example:
		- `_.sine(10,100).scale(-1,1); // bipolar signal`
---
- **set** ( _name_ )
	- stores a FacetPattern in memory for temporary reference in future operations. **NOTE**: You cannot run `.get()` in the same block of commands where the pattern was initially stored via `.set()`. Any FacetPatterns stored via `.set()` will only be stored until the server is closed.
		- example:
		- `_.noise(32).set('my_pattern');`
---
- **shift** ( _amt_ )
	- moves the FacetPattern to the left or the right. `amt` gets wrapped to values between -1 and 1, since you can't shift more than 100% left or 100% right.
	- example:
		- `_.from([1,2,3,4]).shift(-0.5); // 3 4 2 1`
---
- **shuffle** ( )
	- randomizes the FacetPattern.
	- example:
		- `_.from([1,2,3,4]).shuffle(); // first time: 3 2 1 4`
		- `_.from([1,2,3,4]).shuffle(); // second time: 1 3 4 2`
---
- **size** ( _new_size_ )
	- scales the FacetPattern, otherwise preserving its structure, to be `new_size` samples.
	- example:
		- `_.randsamp().size(200).dup(800).play(); // 800 copies of a random file that was then reduced to 200 samples`
---
- **skip** ( _prob_ )
	- Sometimes, skip executing the command, as if it had never been attempted. Useful if you only want to update the wavetable in Max some of the time, but otherwise want to preserve the previous data.
		- example:
		- `_.spiral(16,random(1,360)).skip(0.95);	// only load data into the "new samples" wavetable 5% of the time when this command runs`
---
- **slew** ( _depth_ = 25, _up_speed_ = 1, _down_speed_ = 1 )
	- adds upwards and/or downwards slew to the FacetPattern. `depth` controls how many slew values exist between each value. `up_speed` and `down_speed` control how long the slew lasts: at 0, the slew has no effect, whereas at 1, the slew occurs over the entire `depth` between each FacetPattern value.
	- example:
		- `_.from([0,0.5,0.9,0.1]).slew(25,0,1) // the first three numbers will jump immediately because upwards slew is 0. then it will slew from 0.9 to 0.1 over the course of the entire depth range`
---
- **slices** ( _num_slices_, _commands_ = function, _prob_ = 1 )
	- slices the FacetPattern into `num_slices` slices, and for `prob` percent of those slices, runs `commands`, appending all slices back together. You can refer to the current slice of the algorithm via the reserved word: `this` (see example).
	- example:
		- `_.randsamp().slices(32,1,()=>{this.fft().shift(random()).ifft()});`
---
- **smooth** ( )
	- interpolates each value so it falls exactly between the values that precede and follow it.
	- example:
		- `_.noise(64).smooth(); // less noisy`
---
- **sometimes** (_prob_, _operations_)
	- runs a chain of operations only some of the time, at a probability set by `prob`.
```
_.phasor(1,100).sticky(0.5).scale(40,80).sometimes(0.5,()=>this.reverse());
// half the time, pattern goes up; half the time, it goes down
```
---
- **sort** ( )
	- returns the FacetPattern ordered lowest to highest.
	- example:
		- `_.sine(1,100).sort(); // a nice smoothing envelope from 0 to 1`
---
- **speed** ( _amt_ )
	- increases or decreases the playback speed of the FacetPattern, similar to transposing audio samples up or down. _amt_ values less than 1 speed up; _amt_ values greater than 1 slow down. _amt_ is clamped between 0.02083 and 8.
	- example
		- `_.randsamp().speed(0.2); // fast sample`
		- `_.randsamp().speed(1.5); // slow sample`
---
- **sticky** ( _amt_ )
	- samples and holds values in the FacetPattern based on probability. `amt` (float 0-1) sets the likelihood of each value being sampled and held.
	- example
		- `_.sine(1,1000).sticky(0.98); // glitchy sine`
---
- **subset** ( _percentage_ )
	- returns a subset of the FacetPattern with `percentage`% values in it.
	- example:
		- `_.phasor(1,50).subset(0.3); // originally 50 values long, now 0.02 0.08 0.50 0.58 0.62 0.700 0.76 0.78 0.92`
---
- **truncate** ( _length_ )
	- truncates the FacetPattern so it's now `length` values long. If `length` is longer than the FacetPattern, return the whole FacetPattern.
	- example:
		- `_.from([0,1,2,3]).truncate(2); // now 2 values long`
		- `_.from([0,1,2,3]).truncate(6); // still 4 values long`
---
- **unique** ( )
	- returns the set of unique values in the FacetPattern.
	- example:
		- `_.from([1,2,3,0,0.4,2]).unique(); // 1 2 3 0 0.4`
---
- **walk** ( _prob_, _amt_ )
	- changes positions in the FacetPattern.  `prob` (float 0-1) sets the likelihood of each position changing. `amt` controls how many steps the values can move. If `amt` is set to 10, and `prob` is set to 0.5 half the values could move 10 positions to the left or the right.
	- example:
		- `_.from([0,1,2,0,1,0.5,2,0]).walk(0.25, 3); // a sequence for jamming`
---
### Pattern modulators with a second pattern as argument
- **add** ( _FacetPattern_, _match_sizes_ = false )
	- adds the first FacetPattern and the second FacetPattern. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.sine(1,100).add(_.from([0.5, 0.25, 0.1, 1]));`
- **and** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical AND of both FacetPattern, returning a 0 if one of the values is 0 and returning a 1 if both of the values are nonzero. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.from([1,0,1,0]).and(_.from([0,1])); // 0 0 1 0`
---
- **append** ( _FacetPattern_ )
	- appends the second FacetPattern onto the first.
	- example:
		- `_.sine(1,100).append(_.phasor(1,100)).append(_.from([1,2,3,4]));`
---
- **divide** ( _FacetPattern_, _match_sizes_ = false )
	- divides the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.sine(1,100).divide(_.from([0.5,0.25,0.1,1]));`
---
- **equals** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical EQUALS of both FacetPattern, returning a 0 if the values don't equal each other and returning a 1 if they do. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.sine(1,100).equals(_.sine(2,100)); // two sine waves phasing`

- **interlace** ( _FacetPattern_ )
	- interlaces two FacetPatterns. If one FacetPattern is smaller, it will be interspersed evenly throughout the other FacetPattern.
	- example:
		- `_.sine(1,100).interlace(_.phasor(1,20));`
---
- **map** ( _FacetPattern_ )
	- forces all values of the input FacetPattern to be mapped onto a new set of values from a second FacetPattern.**
	- example:
		- `_.from([1,2,3,4]).map([11,12,13,14]); // 11 11 11 11`
		- `_.from([1,2,3,4]).scale(30,34).map(_.from([31,31.5,32,32.5])); // 31 31.5 32.5 32.5`
---
- **or** ( _FacetPattern_, _match_sizes_ = false )
	- computes the logical OR of both FacetPattern, returning a 0 if both of the values are 0 and returning a 1 if either of the values are nonzero. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.from([1,0,1,0]).or(_.from([0,1])); // 1 0 1 1`
---
- **sieve** ( _FacetPattern_ )
	- uses the second FacetPattern as a lookup table, with each value's relative value determining which value from the input sequence to select.
	- example:
		- `_.noise(1024).sieve(_.sine(10,1024)); // sieving noise with a sine wave into the audio rate :D`
---
- **subtract** ( _FacetPattern_, _match_sizes_ = false )
	- subtracts the second FacetPattern from the first. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.sine(1,100).subtract(_.from([0.5,0.25,0.1,1]));`
---
- **times** ( _FacetPattern_, _match_sizes_ = false)
	- multiplies the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.sine(1,100).times(_.from([0.5,0.25,0.1,1]));`
---
### Audio-rate operations

Facet can load audio samples (currently only .wav files) as FacetPatterns and run arbitrary operations on them.

 To prevent humongous computations, there are some guardrails, but even so, audio processing can increase your computer's CPU load quite a bit, and it is possible that you accidentally run a command that requires more computing power than your computer can handle in real(ish) time. Of course, if you're just running the command for sound design or testing purposes, you can just wait for it to complete and hear what it comes up with. But if the CPU% indicator goes way up, or the server seems to not be responding, just stop and restart the node server in your terminal, and try tailoring the audio commands so they are within the limitations of your machine.

 - **allpass** ( )
 	- runs the audio through an allpass filter.
 	- example:
 		- `_.randsamp().iter(12,1,()=>{this.allpass().delay(random(1,6000))}).scale(-1,1).play(); // reverb :)`
 ---
- **audio** ( )
	- removes any DC offset via a high-pass biquadratic filter at ~0Hz.
	- example:
		- `_.randsamp().times(_.noise(4)).audio().play();`
---
- **chaos** ( _FacetPattern_, _iterations_ = 100, _cx_ = 0, _cy_ = 0)
	- each piece of data in the FacetPattern is paired with the corresponding value in the second FacetPattern. The resulting complex number x,y coordinate is run through a function: f(x) = x2 + c, over `iterations` iterations. The output is a value between 0 and 1, which corresponds to how stable or unstable that particular point is in the complex number plane.
	- By default, both cx and cy are set to 0 (Mandelbrot set). But you can set them to other values from -1 to 1, which can produce all sorts of Julia set variations.
	- example: `_.sine(44,1000).chaos(_.drunk(44100,0.01)).play()`
---
- **convolve** ( _FacetPattern_ )
	- computes the convolution between the two FacetPatterns.
	- example:
		- `_.randsamp().convolve(_.randsamp()).play();	// convolving random samples`
---
- **delay** ( _samples_, _wet_ = 0.5 )
	- delays the input FacetPattern by `samples` samples. You can crossfade between the original and delayed copies with `wet`.
	- example:
		- `_.randsamp().delay(random(1700,10000)).play();`
---
- **harmonics** ( _FacetPattern_, _amplitude=0.9_  )
	- superimposes `FacetPattern.length` copies of the input FacetPattern onto the output. Each number in `FacetPattern` corresponds to the frequency of the harmonic, which is a copy of the input signal playing at a different speed. Each harmonic _n_ in the output sequence is slightly lower in level, by 0.9^_n_. Allows for all sorts of crazy sample-accurate polyphony.
	- example:
		- `_.randsamp().harmonics(_.noise(16).gain(3)).times(ramp(1,0,12000)).play(); // add 16 inharmonic frequencies, all between 0 and 3x the input speed`
		- `_.randsamp().harmonics(_.map([0,0.5,0.666,0.75,1,1.25,1.3333,1.5,1.6667,2,2.5,3],module.exports.noise(3)).play(); // add 3 harmonics at geometric ratios`
---
- **ichunk** ( _FacetPattern_ )
	- slices the input into `FacetPattern.length` windowed chunks (to avoid audible clicks). Loops through every value of `FacetPattern` as a lookup table, determining which ordered chunk of audio from the input sequence it corresponds to, and appends that window to the output buffer.
	- example:
		- `_.randsamp().ichunk(_.ramp(0,0.5,256)).play(); // play 256 slices between point 0 and 0.5 of randsamp()... timestretching :)`
		- `_.noise(4096).sort().ichunk(_.noise(256).sort()).play(); // structuring noise with noise`
---
- **mix** ( _wet_, _command_, _match_sizes_ = false )
	- Mixes the input FacetPattern with a second FacetPattern generated by `command`. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `_.randsamp().ichunk(_.ramp(0,0.5,256)).play(); // play 256 slices between point 0 and 0.5 of randsamp()... timestretching :)`
		- `_.noise(4096).sort().ichunk(_.noise(256).sort()).play(); // structuring noise with noise`
---
- **mutechunks** ( _chunks_, _prob_ )
	- slices the input FacetPattern into `chunks` chunks and mutes `prob` percent of them.
	- example:
		- `_.randsamp().mutechunks(16,0.33).play();	// 33% of 16 audio slices muted`
---
- **randsamp** ( _dir_ = `../samples/` )
	- loads a random wav file from the `dir` directory into memory. The default directory is `../samples/`, but you can supply any directory as an argument.
	- example:
		- `_.randsamp().reverse().play(); // random backwards sample`
---
- **sample** ( _filename_ )
	- loads a wav file from the `samples/` directory into memory. You can specify other subdirectories inside the Facet repo as well.
	- example:
		- `_.sample('1234.wav').play(); // if 1234.wav is in the samples directory, you're good to go`
		- `_.sample('myfolder/myfile.wav'); // or point to the file with a relative path`
---
- **suspend** ( _start_pos_, _end_pos_ )
	- surrounds the FacetPattern with silence, so that the entire input FacetPattern still occurs, but only for a fraction of the overall resulting FacetPattern. The smallest possible fraction is 1/8 of the input FacetPattern, to safeguard against generating humongous and almost entirely empty wav files.
	- example:
		- `_.randsamp().suspend(0.25,0.75).play();	// the input pattern is now squished into the middle 50% of the buffer`
