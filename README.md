## Overview

Facet is an open-source live coding system for algorithmic music and synthesis. With a code editor in the browser, a pair of NodeJS servers running locally on your machine, and Max or Max for Live, Facet can generate and sequence audio, MIDI, and OSC data in real-time.

Facet runs on MacOS, Linux, and Windows.

## Installation and getting started

1. Download and install Node.js (must be v14 or greater) and npm: https://www.npmjs.com/get-npm
2. Download and install SoX as a command line tool (the latest version is 14.4.2): http://sox.sourceforge.net/ If using homebrew: `brew install sox` should work. If running on Windows: you need to modify your Path environment variable so that sox can be run from the command line. Ultimately you need to be able to run the command `sox` from the command line and verify that it's installed.
3. Download or clone the Facet repository.
4. In a terminal, navigate to the root of the Facet repository, and run `npm install`.
5. After the previous command completes, run `npm run facet`. This will start the servers that run in the background for generating and patterns and keeping time. If running on Windows: Windows has a firewall by default for local connections (on the same private network), and it needs to be disabled, or you can manually allow the connection via the confirmation dialog from the Windows firewall system when starting up the servers.
6. In a browser tab, navigate to http://localhost:1124. This is the browser window with the code editor.
7. Open Max, or if using Max for Live, click the Edit Button to launch the Max Editor. In the Max navbar, go to > Options > File Preferences, click "Add Path", and add the facet directory (the folder that contains this file). Make sure that the Subfolders checkbox is checked.
8. If using Max: Create a new patcher, and add a "facet" object. Connect its left outlet (audio channel 1) and middle outlet (audio channel 2) to a DAC.
9. If using Max for Live: move the `max/facet.amxd` and `max/facet_4ch.amxd` files from this directory to where you store your Max for Live Audio Effect devices. Drop an instance of `facet.axmd` into a track in a Live set.
10. Copy this command into the code editor in the browser: `$('test').sine(100).play();` Move your cursor so it's on the line. Hit `[ctrl + enter]` to run the command. The code editor application will always briefly highlights to illustrate what command(s) ran. You should hear a sine wave playing. Hit `[ctrl + .]` or `[ctrl + /]` (Windows) to stop.

## Facet commands

### Syntax

Facet commands are based entirely around JavaScript, using a custom class called a `FacetPattern`. In order to produce audio or MIDI output, create an instance of a FacetPattern, and run some methods:

`new FacetPattern('example').sine(100).play();`

There is a shorthand for creating a new FacetPattern instance:

`$('example').sine(100).play();`

Some FacetPatterns might contain other FacetPatterns. The most outer-facing one must have a name via the above method `$()`, but other FacetPatterns inside the code can use a separate, more concise shorthand, `_`:

`$('example').sine(100).times(_.sine(100)).play();`

There are lots of methods to generate, translate, and orchestrate playback on FacetPattern data:

`$('example').sine(100).times(random()).play();`
`// each time you run ^, the same sine wave at a different volume`

Certain operations (e.g. `sometimes()`, `iter()`, `slices()`, `mix()`) allow you to supply functions as arguments:

`$('example').iter(16,()=>{this.append(_.randsamp().speed(0.1))}).play();`
`// stitches together 16 random samples, each playing at 10x normal speed`

### UI controls in the browser

Below the text editor, there are several UI elements which control the servers running in the background. Moving from left to right:

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
- Stop playback: `[ctrl + .]` or `[ctrl + /]`
- Stop regenerating patterns: `[ctrl + ,]`
- Autocomplete / list methods: `[ctrl + space]`. This will list all available methods including their arguments in a dropdown menu, filtered by the text preceding the cursor position. If only one matching method is found, it will autocomplete that method.

### Running "npm run facet"

When you run the `npm run facet` command in the terminal, the following sequence of events occurs:

A server, known as the `process manager`, starts up on http://localhost:5831. This server is responsible for managing the startup and shutdown of the two servers listed below:

1. The `transport server` starts up on http://localhost:3211. This server is responsible for handling the timing and playback of audio, MIDI, and OSC events.

2. The `pattern generator` server starts up on http://localhost:1123. This server listens to requests from the text editor UI in the browser located at http://localhost:1124 and interprets those commands into data. If the pattern is intended to be played back as audio, a corresponding .wav file will be stored in the `tmp/` subdirectory in the Facet repo. Otherwise, if the pattern is intended for MIDI or OSC output, the data will be posted directly to the transport server.

### Max / Max for Live

In order to play audio files generated with Facet, Max or Max for Live is required. (It is possible, however, to use Facet without Max, for only MIDI and OSC output.)

The necessary Max patchers are included in this repo. Make sure to configure File Preferences in Max (step 7 from the getting started section above) in order for these patchers to work properly.

If running Max: the `facet.maxpat` patcher has 4 individual channels of audio output plus a fifth outlet for passing OSC commands into your patcher.

If running Max for Live: the `facet.axmd` and `facet_4ch.amxd` Max for Live devices allow for stereo and 4 channel audio outputs in Ableton Live, respectively. To access the third and fourth channels of `facet_4ch.amxd`, create a second track and select input channels 3/4 from the input track where `facet_4ch.amxd` is running.

### Variables

#### mousex / mousey

Both `mousex` and `mousey`, as floating-point number representations of your cursor's position _in the browser window_, are available for use in commands, e.g.:

```
$('example').sine(100).times(mousey).play(); // cursor y position controls volume every time the code runs
```

#### notevalues

There are 128 notevalues variables, corresponding to divisions of 1 whole note. A whole note is `n1`, a half note is `n2`, etc... up to `n128`.

#### bpm

The variable `bpm` (representing the current BPM in the Facet transport when the FacetPattern is generated) is available for use in commands as well.

#### bars

The variable `bars` (representing how many loops have occurred since the time the server was started) is available for use in commands as well. This is especially useful with the modulo % operator, e.g.: `bars%4`, which could be either 0, 1, 2, or 3, depending on how many loops have occurred.

## Sample rate

You can change the sample rate for the audio generated and played back with Facet by modifying `SAMPLE_RATE` in `js/config.js` to whatever integer you want.

In Facet commands, you can use the constant `SAMPLE_RATE` to refer to the configured sample rate, which is useful when you want to do something for a specific number of seconds. 

For example: `$('example').noise(SAMPLE_RATE).play(); // generate and continually play back exactly 1 second of noise`

## Global event resolution

By default, Facet checks every 10 milliseconds whether it needs to fire any events that produce output, such as playing audio, MIDI, or osc. You can change  `EVENT_RESOLUTION_MS` in `js/config.js` to set a different integer value. Slower speeds (e.g. 20 = 20ms) will produce less tightly-timed events but can help make it possible for Facet to run on computers with less CPU resources, at the expense of slight timing accuracy. Faster speeds (e.g. 4 = 4ms) will produce tighter event scheduling but can overload computers with less CPU resources.

## Command reference

### Outputs

Facet can synthesize and orchestrate the playback of multiple FacetPatterns simultaneously, producing audio, MIDI, or OSC output. By default, patterns will continually regenerate each loop. In order to only regenerate every n loops, use the `.every()` function. In order to only play back once, use the `.once()` function.

### Audio output
- **channel** ( _channels_ )
	- Facet ultimately creates wav files that can have any number of channels. The `.channel()` function (and equivalent `channels()` function) allow you to route the output of a FacetPattern onto the specified channel(s) in the `channels` input array. **NOTE:** CPU will also increase as the total number of channels increases.
	- example:
		- `$('example').randsamp().channel(1).play(); // first channel only`
		- `$('example').randsamp().channels([1,3]).play(); // second channel only`
		- `$('example').randsamp().channel(_.from([9,10,11,12,13,14,15,16]).shuffle().reduce(ri(1,8))).play(); // play on a random number of channels from 9-16`
---
- **pan** ( _PanningFacetPattern_, _pan_mode_ = 0 )
	- dynamically moves the FacetPattern between however many channels are specified in a seperate `.channels()` call. Without a call to `.channels()`, it will default to spatially positioning the FacetPattern between channels 1 and 2.
	- the values in `PanningFacetPattern` should be between -1 and 1. Values beyond that will be clipped to the -1 - 1 range. A value of -1 will hard-pan the sound to the first active channel that is set via a `.channels()` call (or defaulting to stereo). A value of 1 will hard-pan the sound to the last active channel. Values between -1 and 1 will crossfade between all the specified active channels.
	- the default `pan_mode` of 0 means that the panning moves smoothly between channels, e.g., channels adjacent to the selected full-volume channel will have some signal bleeding into them. Switching the `pan_mode` to 1 makes the panning work in a discrete manner, where only one channel has a signal in it at any given time, and there is no bleed between channels.
	- example:
		- `$('example').noise(n1).times(_.ramp(1,0,n1)).pan(_.sine(1,n1)).play(); // no channels are specified; defaults to stereo panning`
		- `$('example').noise(n1).times(_.ramp(1,0,n1)).channels([1,2,4]).pan(_.sine(1,n1)).play(); // pans the noise smoothly around channels 1, 2, and 4`
		- `$('example').noise(n1).times(_.ramp(1,0,n1)).channels([1,2,4]).pan(_.sine(1,n1),1).play(); // hard-pans the noise discretely between channels 1, 2, and 4`
---
- **play** ( _PlaybackFacetPattern_ )
	- plays the FacetPattern as audio to your computer's currently selected default audio output device, at however many positions are specified in `PlaybackFacetPattern`, as the global transport loops through a whole note. If you want to use a different audio output device with Facet, select it as your computer's default audio output device.
	- `PlaybackFacetPattern` should contain floating-point numbers between 0 and 1, corresponding to the relative point in the transport between 0 and 1 when the generated audio should play.
	- With no arguments, the command will regenerate at point 0, i.e. at the beginning of each whole note. You can supply a number, array, or FacetPattern as the argument.
	- By default, the FacetPattern will continue to regenerate and play. To prevent it from regenerating, include a `keep()` operation. To stop playback, use the key command `[ctrl + .]` or press the stop button "■".
	- example:
		- `$('example').randsamp().play();	// plays once at beginning of loop`
		- `$('example').randsamp().play(0.5);	// plays once at middle point`
		- `$('example').randsamp().play(_.noise(4));	// plays once at 4 random positions`
---
- **saveas** ( _filename_ )
	- creates a new wav file in the `samples/` directory or a sub-directory containing the FacetPattern. If the directory doesn't exist, it will be created.
	- if a file has been created with multiple channels via `.channels()` or with its audio panned between multiple channels via `.pan()`, the saved wav file will have that many channels.
	- __Note__: this examples uses MacOS / Linux file paths with forward slashes (e.g. `my/path/here`). For Windows, you will need to use back slashes (e.g `my\path\here`)
	- example:
		- `$('example').iter(6,()=>{this.append(_.sine(ri(1,40))).saveas('/myNoiseStuff/' + Date.now()`)}); // creates 6 wav files in the myNoiseStuff directory. Each filename is the UNIX timestamp to preserve order.
---
- **stitchdir** ( _dir_, _samplesBetweenEachFile_, _saved_filename_ = 'stitched', _num_channels_ = 1 )
	- stitches together all the wav files in the supplied `dir` directory, in alphabetical order, creating a new wav file in the `samples/` directory or a sub-directory, as specified in `saved_filename`. If the directory doesn't exist, it will be created.
	- the `samplesBetweenEachFile` argument can be a single number or a FacetPattern. This value specifies the exact number of samples between each file in the output file. If it's a FacetPattern, its values will be continuously cycled through while stitching together all the files in the directory.
	- all files in the directory should have the same number of channels. The stitched wav file will have `num_channels` channels (default = 1).
	- __Note__: this process can take minutes if there are a lot of wavs, so by default any time this method is called, it will be called once and only once.
	- __Note__: this examples uses MacOS / Linux file paths with forward slashes (e.g. `my/path/here`). For Windows, you will need to use back slashes (e.g `my\path\here`)
	- example:
		- `$('example').stitchdir('mysamples',n1,'myNewStitchedFile'); // stitch together all the wavs in samples/mysamples, with a whole note between each file, creating a new file called MyNewStitchedFile.wav`

### MIDI / OSC output
You might need to activate a MIDI driver on your machine in order to send MIDI from Facet to a DAW. If Facet finds no MIDI drivers, the dropdown select UI in the browser will be empty, and if you try the below commands they will produce no output. Google "install MIDI driver {your OS goes here}" for more information.

You need to connect the MIDI device you want to use before starting Facet.

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
		- `$('example').ramp(36,72,32).chord('maj7').add((bars%4)*12).key('F# major').note(50,100,1);`
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
	- _Note_: This function is automatically scaled into the expected range for MIDI pitchbend data. It expects a FacetPattern of values between -1 and 1, with 0 meaning no pitchbend.
	- example:
		- `$('example').sine(1).size(128).pitchbend();`

### Methods for controlling transport BPM
- **bpm** ( )
	- stores the FacetPattern data in the transport as BPM values to be cycled through over each loop.
	- BPM patterns have a 256 value maximum.
	- example:
		- `$('example').from([20,40,80,160,320]).shuffle().bpm(); // each loop will be all 5 of these BPM, randomly ordered`

### Methods for controlling pattern regeneration
- **every** ( _n_loops_ )
	- only regenerate the pattern after `n_loops` loops. By default, patterns regenerate each loop, so this function only needs to be included if you wish to regenerate a pattern less frequently.
	- example:
		- `$('example').sine(ri(10,500)).times(rf()).every(4).play(); // slightly different sine wave tone every 4 loops`
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
- **barmod** ( _modulo_, _values_ )
	- returns values that depend on the current value of `bars`. (`bars` is a global variable that starts at 0 and increments at the completion of a loop.)
	- selects a value from the `values` array, based on `bars % modulo`.  If the `bars` value currently is 9, and the `modulo` argument to this function is 4, since 9 % 4 = 1, this function will return the value from the `values` array immediately following the number 1.
	- **NOTE**: The function first checks if the `values` array contains an even number of elements. If not, it throws an error.
	- **NOTE**: The function checks if every integer from 0 to (mod-1) is one of the even-numbered keys of the values array. If not, it throws an error.
	- example:
		- `$('example').sine(barmod(4,[0,100,1,150,2,200,3,300])).play(); // when bars % 4 == 0, plays a 100Hz sine. when bars % 4 == 1, plays a 150 Hz sine. when bars % 4 == 2, plays a 200Hz sine. when bars % 4 == 3, plays a 300Hz sine.`
---
- **choose** ( _pattern_ )
	- returns a randomly selected value from a supplied array.
	- example:
		- `$('example').sine(choose([10,200,1000])).play(); // sine wave with either 10, 200, or 1000 cycles`
---
- **ftom** ( _hzfrequency_ )
	- converts the supplied `hzfrequency` value to its corresponding MIDI note number.
	- example:
		- `$('example').sine(220).times(_.sine(ftom(ri(400,1200)))).play(); // 220Hz sine wave (A) multplied by a chromatically related higher sine wave`
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

### FacetPattern generators that can take a FacetPattern, number, or array as an argument
When a generator takes a FacetPattern or an array as an argument, it uses that pattern to dynamically change its behavior over time, affecting the output in a more complex way than if a single number were supplied. For example, with the command `$('example').sine(440).play();`, the output is a static 440Hz wave. But with the command `$('example').sine(_.sine(5).scale(20,2000))).play();`, the frequency of the sine wave is being modulated by a 5 Hz sine wave which is generating values between 20 and 2000. This produces a classic frequency modulation sound, but since you can supply any FacetPattern as an argument, there are lots of sound design possibilities.

- **sine** ( _frequencyPattern_, _duration_ = sample_rate, _samplerate_ = sample_rate )
	- generates a sine wave at `frequencyPattern` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- output range is from -1 - 1.
	- example:
		- `$('example').sine(440,n4).play(); // 440 Hz sine wave for a quarter note`
		- `$('example').sine(_.ramp(10,2000,300)).play(); // ramp from 10Hz to 2000 Hz over 300 values`
		- `$('example').sine(_.sine(5).scale(20,2000)).play(); // 5Hz frequency modulation with output frequencies oscillating between 20Hz and 2000Hz`
---
- **cosine** ( _frequencyPattern_, _duration_ = 1 second, _samplerate_ = default_sample_rate )
	- generates a cosine wave at `frequencyPattern` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- output range is from -1 - 1.
	- example:
		- `$('example').cosine(440,n4).play(); // 440 Hz cosine wave for a quarter note`
		- `$('example').cosine(_.ramp(10,2000,300)).play(); // ramp from 10Hz to 2000 Hz over 300 values`
		- `$('example').cosine(_.cosine(5).scale(20,2000)).play(); // 5Hz frequency modulation with output frequencies oscillating between 20Hz and 2000Hz`
---
- **phasor** ( _frequencyPattern_, _duration_ = 1 second, _samplerate_ = default_sample_rate )
	- generates a phasor wave at `frequencyPattern` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- output range is from -1 - 1.
	- example:
		- `$('example').phasor(440,n4).play(); // 440 Hz phasor wave for a quarter note`
		- `$('example').phasor(_.ramp(10,2000,300)).play(); // ramp from 10Hz to 2000 Hz over 300 values`
		- `$('example').phasor(_.phasor(5).scale(20,2000)).play(); // 5Hz frequency modulation with output frequencies oscillating between 20Hz and 2000Hz`
---
- **pluck** ( _frequencyPattern_, _duration_ = 1 second, _damping_ = 0, _feedback_ = 0.5 )
	- generates a Karplus-Strong type string pluck emulation at `frequencyPattern` Hertz, lasting for `duration` samples. `damping` and `feedback` values should be between 0 and 1.
	- output range is from -1 - 1.
	- example:
		- `$('example').pluck(440,n4,rf(),rf()).play(); // different 440 Hz quarter note pluck each time`
		- `$('example').pluck(_.ramp(100,2000,300),n1,0,0.99).play(); // ramp from 100Hz to 2000 Hz over 300 values`
---
- **rect** ( _frequencyPattern_, _duration_ = 1 second, _pulse_width_ = 0.5, _samplerate_ = default_sample_rate )
	- generates a rectangle wave at `frequencyPattern` Hertz, with a pulse width defined by `pulse_width`,  lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- output range is from -1 - 1.
	- example:
		- `$('example').rect(440,n4,rf()).play(); // 440 Hz rectangle wave for a quarter note, different bandwidth each time`
		- `$('example').rect(_.ramp(10,2000,300)).play(); // ramp from 10Hz to 2000 Hz over 300 values`
		- `$('example').rect(_.rect(5).scale(20,2000)).play(); // 5Hz frequency modulation with output frequencies oscillating between 20Hz and 2000Hz`
---
- **square** ( _frequencyPattern_, _duration_ = sample_rate, _samplerate_ = sample_rate )
	- generates a square wave at `frequencyPattern` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- output range is from -1 - 1.
	- example:
		- `$('example').square(440,n4).play(); // 440 Hz square wave for a quarter note`
		- `$('example').square(_.ramp(10,2000,300)).play(); // ramp from 10Hz to 2000 Hz over 300 values`
		- `$('example').square(_.square(5).scale(20,2000)).play(); // 5Hz frequency modulation with output frequencies oscillating between 20Hz and 2000Hz`
---
- **tri** ( _frequencyPattern_, _duration_ = sample_rate, _samplerate_ = sample_rate )
	- generates a triangle wave at `frequencyPattern` Hertz, lasting for `duration` samples, at the sample rate defined by `samplerate`.
	- Output range is from -1 - 1.
	- example:
		- `$('example').tri(440,n4).play(); // 440 Hz triangle wave for a quarter note`
		- `$('example').tri(_.ramp(10,2000,300)).play(); // ramp from 10Hz to 2000 Hz over 300 values`
		- `$('example').tri(_.tri(5).scale(20,2000)).play(); // 5Hz frequency modulation with output frequencies oscillating between 20Hz and 2000Hz`

### FacetPattern generators
- **binary** ( _integer_, _length_)
	- Computes the binary representation of `integer`. If `length` is not present, the output FacetPattern will be the actual length of the binary representation of `integer`.
	- output range is from 0 - 1.
	- example:
		- `$('example').binary(8); // 1000`
		- `$('example').binary(490321,13); // 1110111101101: truncated at 13 values`
		- `$('example').binary(8,12); // 000000001000: padded with 0s`
---
- **drunk** ( _length_, _intensity_, _starting_value_ = Math.random() )
	- generates a random walk of values between 0 and 1 for `length` values, starting at `starting_value` which is a random value between 0 and 1 by default. `intensity` controls how much to add.
	- output range is from 0 - 1.
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
	- output range is from 0 - 1.
	- example:
		- `$('example').sine(100).times(_.euclid(4,8)).play(); // gating a sine wave with a euclidean sequence`
---
- **file** ( _filepath_ )
	- loads the raw data of any file into memory. You can supply any file type.
	- output range is from -1 - 1.
	- By default, it checks for a file in the `files` subdirectory. If no file exists there, it will try to load the file as an absolute path on your hard drive. 
	- __Note__: this examples uses MacOS / Linux file paths with forward slashes (e.g. `my/path/here`). For Windows, you will need to use back slashes (e.g `my\path\here`)
	- example:
		- `$('example').file('my_image.png').play(); // if my_image.png is in the files directory, this will play the file's raw data. NOTE: this could be very noisy!`
		- `$('example').file('/Users/my_username/Desktop/myfile.zip').play(); // example with a supplied absolute file path`
---
- **from** ( _pattern_ )
	- allows the user to specify their own pattern. **Note the array syntax!**
	- example:
		- `$('example').from([1,2,3,4]);`
---
- **image** ( _filepath_, _columnsPerSecond_ = 512, _minimumFrequency_ = 20, _maximumFrequency_ = sample_rate / 2, _frequencyPattern_ )
	- transposes an image into audio by superposing sine waves across the audio spectrum, with one sine wave for each row of pixels in the image. The amplitudes of each sine wave are modulated by the corresponding brightness of each pixel in the image, producing an analog of the image in the audio spectrum.
	- the lowest pixels in the image correspond to the lowest frequencies in the output, and the highest pixels in the image correspond to the highest frequencies in the output.
	- the default `columnsPerSecond` value of 512 means that each second of audio will contain 512 columns of pixels. This value can be larger or smaller, but keep in mind that as this value decreases, the file will take more time to generate. This method can be CPU intensive and works best with smaller image files or larger `columnsPerSecond values`.
	- since pixel brightness corresponds with loudness, images with dark backgrounds and high contrast will produce clearer tones.
	- This method currently only works with JPEG files, and sometimes even certain JPEG files won't work. (I have submitted a GitHub issue: https://github.com/revisitors/readimage/issues/4) Re-saving the JPEG files in GIMP seems to create files that the middleware this method uses can parse correctly.
	- the `minimumFrequency` and `maximumFrequency` values control the range of frequencies that the pixels will map onto.
	- the `frequencyPattern` argument allows you to remap the rows of pixels with a FacetPattern. It should be scaled between 0 and 1. It will automatically be resized so its data length matches the height of the image in pixels. Lower values in `frequencyPattern` will map onto lower frequencies inside the range of `minimumFrequency` and `maximumFrequency`. Higher values in `frequencyPattern` will map onto higher frequencies inside the range of `minimumFrequency` and `maximumFrequency`.
	- output range is from -1 - 1.
	- __Note__: this examples uses MacOS / Linux file paths with forward slashes (e.g. `my/path/here`). For Windows, you will need to use back slashes (e.g `my\path\here`)
	- example:
		- `$('example').image('/path/to/file/goes/here.jpg',1024).play(); // each column lasts 1024 samples`
---
- **noise** ( _length_ )
	- generates a random series of values between -1 and 1 for `length`.
	- example:
		- `$('example').noise(1024).play();`
---
- **primes** ( _n_, _offset_from_first_prime_ = 2, _skip_ = 1 )
	- generates the first `n` prime numbers starting at `offset`, skipping `skip` prime numbers before including the next one in the list.
	- `n` specifies the number of prime numbers to generate.
	- `offset` specifies the first number to be included in the list of prime numbers. The default value is 2.
	- `skip` specifies the number of prime numbers to skip before including the next one in the list. The default value is 1.
	- example:
		- `$('s').noise(n4).times(_.ramp(1,0,n4)).iter(12,()=>{this.allpass().delay(_.primes(60,1000,ri(20,2000)).data[i]).full()}).full().play(); // generates a quarter note transient burst of noise, then iteratively sends it through delays that are all primes`
- **ramp** ( _from_, _to_, _size_, _curve_type_ = 0.5 )
	- moves from `from` to `to` over `size` values.
	- example:
		- `$('example').ramp(250,100,1000); // go from 250 to 100 over 1000 values`
---
- **randfile** ( _dir_ = `../files/` )
	- loads a random file from the `files` directory into memory. The default directory is `../files/`, but you can supply any directory as an argument.
	- output range is from -1 - 1.
	- __Note__: this examples uses MacOS / Linux file paths with forward slashes (e.g. `my/path/here`). For Windows, you will need to use back slashes (e.g `my\path\here`)
	- example:
		- `$('example').randfile().play(); // random new file converted to audio every time`
---
- **randsamp** ( _dir_ = `../samples/` _channel_index_ = 0 )
	- loads a random wav file from the `dir` directory into memory. The default directory is `../samples/`, but you can supply any directory as an argument.
	- By default, it loads the first channel (`channel_index` = 0) but you can specify any channel to load.
	- __Note__: this examples uses MacOS / Linux file paths with forward slashes (e.g. `my/path/here`). For Windows, you will need to use back slashes (e.g `my\path\here`)
	- example:
		- `$('example').randsamp().reverse().play(); // random backwards sample`
---
- **sample** ( _filepath_, _channel_index_ = 0)
	- loads a wav file from the `samples/` directory into memory. You can specify other subdirectories inside the Facet repo as well. The `.wav` can be omitted from _filename_; in this case `.wav` it will be automatically appended to _filename_. By default, it loads the first channel (`channel_index` = 0) but you can specify any channel to load.
	- __Note__: this examples uses MacOS / Linux file paths with forward slashes (e.g. `my/path/here`). For Windows, you will need to use back slashes (e.g `my\path\here`)
	- example:
		- `$('example').sample('1234').play(); // if 1234.wav is in the samples directory, you're good to go`
		- `$('example').sample('./myfolder/myfile.wav'); // or point to the file with a relative path`
---
- **silence** ( _length_ )
	- generates silence (many 0s in a row) for `length` samples.
	- example:
		- `$('example').silence(n2).append(_.noise(n2)).play(); // first half of loop is silence; second half is noise`
---
- **spiral** ( _length_, _degrees_ = 360/length, _angle_phase_offset_ = 0 )
	- generates a spiral of length `length` of continually ascending values in a circular loop between 0 and 1, where each value is `degrees` away from the previous value. `degrees` can be any number between 0 and 360. By default `degrees` is set to `360/length` which produces an output pattern similar to branching leaves, where each value is as far away as possible from the previous value.
	- The `angle_phase_offset` argument changes where the sequence starts. At its default value of 0, the first value will be 0. You can supply any float between 0 and 1, and the sequence will begin at that value instead.
	- output range is from 0 - 1.
	- example:
		- `$('example').sine(1).times(_.spiral(1000,ri(1,360))).play(); // an interesting, modulated sine wave`
---
- **turing** ( _length_ )
	- generates a pattern of length `length` with random 1s and 0s.
	- example:
		- `$('example').turing(64); // instant rhythmic triggers`

### FacetPattern modulators
- **abs** ( )
	- returns the absolute value of all numbers in the FacetPattern.
	- example:
		- `$('example').sine(100).add(-0.3).abs().play(); // a wonky sine`
---
- **allpass** ( _frequency_ = default_sample_rate/2 )
 	- runs the FacetPattern through an allpass filter.
	- `frequency` changes the amount of phase shift introduced by the filter at different frequencies. It will change the phase response of the filter while leaving the magnitude response unchanged.
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
	- removes any DC offset on the FacetPattern by running it through a high-pass biquadratic filter at 5Hz.
	- example:
		- `$('example').randsamp().times(_.noise(4)).audio().play();`
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
- **comb** ( _delaysamples_ = sample_rate / 100, _feedforward_ = 0f5, _feedback_ = 0.5 )
	- applies a comb filter to the input data. The `delaySamples` parameter is equal to 10ms by default and specifies the number of samples to delay the input signal. The `feedforward` parameter controls the amount of the input signal that is fed directly to the output. The `feedback` parameter controls the amount of feedback applied to the delay, allowing the delayed signal to be mixed back into the input.
	- The `feedback` and `feedforward` values are clamped between 0 and 0.98.
	- example:
		- `$('example').noise(n4).comb(ms(10),0.5,0.5).play();`
---
- **compress** ( _ratio_, _threshold_, _attackTime_, _releaseTime_ )
	- compresses the FacetPattern into a smaller dynamic range. `ratio` is a float between 0 and 1 corresponding to n:1 so 0.5 would be 2:1, 0.2 would be 5:1, etc. `threshold` is the sample amplitude at which compression kicks in. `attackTime` and `releaseTime` are expressed as relations to a second, so 0.1 would be 1/10th of a second.
	- example:
		- `$('example').randsamp().compress(0.1,0.001,0.01,0.01).play();`
---
- **crab** ( )
	- superposes a reversed copy of the FacetPattern on top of iself, so it plays backwards and forwards at the same time..
	- example:
		- `$('example').sine(_.ramp(20,2000,1000)).crab().full().play(); // sine wave ramps from 20Hz to 2000Hz both backwards and forwards at the same time`
---
- **curve** ( _tension_ = 0.5, _segments_ = 25 )
	- returns a curved version of the FacetPattern. Tension and number of segments in the curve can be included but default to 0.5 and 25, respectively.
	- example:
		- `$('example').noise(16).curve();				// not so noisy`
		- `$('example').noise(16).curve(0.5, 10);		// fewer segments per curve`
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
- **flipabove** ( _maximum_ )
	- for all values above `maximum`, it returns `maximum` minus how far above the value was.
	- example:
		- `$('example').sine(100).flipabove(0.2).play(); // wonky sine`
---
- **flipbelow** ( _min_ )
	- for all values below `minimum`, it returns `minimum` plus how far below the value was.
	- example:
		- `$('example').sine(100).flipbelow(0.2).play(); // inverse wonky sine`
---
- **follow** ( _attackTime_ = default_sample_rate / 10, _releaseTime_ = default_sample_rate / 4 )
	- performs envelope following on a FacetPattern.
	- `attackTime` is the attack time in samples. It controls the speed at which the envelope rises. Its default value is 100ms.
	- `releaseTime` is the release time in samples. It controls the speed at which the envelope falls. Its default value is 250ms.
	- example:
		- `$('example').noise(n1).times(_.noise(32).scale(0,1).size(n1).follow(n16,n16)).play(); // controlling the amplitude of a whole note of noise, with 32 samples of noise sent through the envelope follower`
---
- **fracture** ( _pieces_ )
	- divides and scrambles the FacetPattern into `pieces` pieces.
	- example:
		- `$('example').sine(100).fracture(10).play(); // the sine has shattered into 10 pieces!`
---
- **full** ( )
	- rescales the FacetPattern to a full dynamic range between -1 and 1, without any dynamic range compression, in a more efficient way than `scale(-1,1)`.
	- example:
		- `$('example').noise(n2).times(0.1).loud().play(); // remove loud() to hear the difference`
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
		- `$('example').sine(1).times(4000).normalize(); // the gain is undone!`
		- `$('example').sine(1).scale(-10,10).normalize(); // works with negative values`
---
- **nonzero** ( )
	- replaces all instances of 0 with the previous nonzero value. Useful after with probability controls, which by default will set some values to 0. Chaining a nonzero() after that would replace the 0s with the other values the pattern. Particularly in a MIDI context with .prob(), you probably don't want to send MIDI note values of 0, so this will effectively sample and hold each nonzero value, keeping the MIDI note values in the expected range.
	- example:
		- `$('example').from([1,2,3,4]).prob(0.5).nonzero(); // if 2 and 4 are set to 0 by prob(0.5), the output of .nonzero() would be 1 1 3 3`
---
- **palindrome** ( )
	- returns the original FacetPattern plus the reversed FacetPattern.
	- example:
		- `$('example').from([0,1,2,3]).palindrome(); // 0 1 2 3 3 2 1 0`
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
- **rangesamps** ( _start_, _length_ )
	- returns a subset of the FacetPattern, using a relative `start` position (between 0 - 1) and a total length in samples.
	- example:
		- `$('example').sine(n1).log(0.9).rangesamps(rf(0,0.875),n8).play(); // plays a different 8th note from the same de-pitched sine wave every time`
		- `$('example').silence(n1).iter(128,()=>{this.sup(_.noise(n64).lpf(_.ramp(250,40,20),50).times(_.ramp(1,0,n64)).rangesamps(rf(),n64).fade(0.1),rf())}).play(); // granular synthesis of 128 synthesized kick drums`
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
- **reverb** (  _size_ = 1, _feedback_ = 0.85 )
	- applies the Schroeder reverb algorithm to the FacetPattern. The `size` argument should be between 0 and 2 for most use cases but can go up to 10.
	- the `feedback` argument controls feedback in the reverb algorithm. It should be between 0 and 0.98.
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
- **scale** ( _new_min_, _new_max_, _exponent_ = 1 )
	- moves the FacetPattern to a new range, from `new_min` to `new_max`, with `exponent` allowing for nonlinear transformations. **NOTE**: this function will return the average of new_min and new_max if the FacetPattern is only 1 value long. since you cannot interpolate where the value would fall in the new range, without a larger FacetPattern to provide initial context of the value's relative position. This operation works better with sequences larger than 3 or 4.
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
- **stretchto** ( _num_samples_ )
	- time-stretches the FacetPattern while preserving pitch so it now lasts `num_samples` samples.
	- example:
		- `$('example').sine(1000,n2).stretchto(n1).play(); // 1000Hz sine wave originally a half note long, stretched to a whole note`
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
		- `$('example').sine(100).add(-0.1).wrap(0.2,0.5).play();`
---

### Pattern modulators that can take a FacetPattern, number, or array as an argument
When a modulator takes a FacetPattern or an array as an argument, it uses that pattern to dynamically change its behavior over time, affecting the output in a more complex way than if a single number were supplied. For example, with the command `$('example').noise(16).add(4)`, all 16 output values will be between 4 and 5, because 4 is added to every noise value, and noise values are between 0 and 1 by default. But with the command `$('example').noise(16).add(_.ramp(0,4,16))`, the output values will ramp from between 0-1 at the beginning to between 4-5 at the end, since the FacetPattern that is being added is a ramp of values starting at 0 and ending at 4.

- **add** ( _FacetPattern_, _match_sizes_ = true )
	- adds the first FacetPattern and the second FacetPattern. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').randsamp().add(_.randsamp()).play(); // two random samples each loop`
---
- **bpf** ( _cutoffPattern_ = 1000, _q_ = 2.5 )
	- applies a bandpass filter with configurable `cutoffPattern` and `q` to the FacetPattern.
	- example:
		- `$('example').noise(n1).bpf(1000,6).times(0.1).play(); // band-passed noise`
		- `$('example').noise(n1).bpf(_.sine(4).scale(10,1000)).play(); // 4-cycle LFO modulating the bandpass cutoff between 10 and 1000 Hz`
---
- **crush** ( _numberOfBitsPattern_, _downsamplingPattern_ )
	- applies bit crushing and / or downsampling to the incoming FacetPattern.
	- `numberOfBitsPattern` controls the bit depth for the output pattern. To hear the effect, the values need to be integers between 1 and 8. Lower values produce more drastic results.
	- `downsamplingPattern` controls the fator by which to reduce the sample rate. Values need to be integers greater than 1. Higher values produce more drastic results.
	- example:
		- `$('example').sine(100).crush(2).play(); // redux on the sine wave`
		- `$('example').sine(100,n1).crush(_.ramp(8,1,8)).play(); // ramping bit depth on 100Hz sine wave from 8 bits to 1`
		- `$('example').sine(100,n1).crush(_.ramp(8,1,8),_.noise(16).scale(1,40)).play(); // ramping bit depth on 100Hz sine wave from 8 bits to 1, and dynamically changing the downsampling amount between 1 and 40 samples`
---
- **delay** ( _delaySamplesPattern_, _feedback_ = 0.5 )
	- delays the input FacetPattern by `delaySamplesPattern` samples. The `feedback` parameter controls the amount of feedback applied to the delay, allowing the delayed signal to be mixed back into the input.
	- the maximum `feedback` value is 0.975.
	- example:
		- `$('example').randsamp().delay(random(1700,10000)).play();`
---
- **divide** ( _FacetPattern_, _match_sizes_ = true )
	- divides the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(1).divide(_.from([0.5,0.25,0.1,1]));`
---
- **harmonics** ( _numHarmonicsPattern_ )
	- adds `numHarmonicsPattern` harmonics to the input signal.
	- example:
		- `$('example').sine(10).harmonics(200).play(); // 10Hz sine wave with 200 harmonics added on top`
		- `$('example').sine(10,n1).harmonics(_.ramp(0,200,200)).play(); // ramping up from 0 harmonics on the 10Hz wave to 200 harmonics`
---
- **hpf** ( _cutoffPattern_ = 100, _q_ = 2.5 )
	- applies a high pass filter with configurable `cutoffPattern` and `q` to the FacetPattern.
	- example:
		- `$('example').noise(n1).hpf(2000,6).times(0.1).play(); // high-passed noise`
		- `$('example').noise(n1).hpf(_.sine(4).scale(10000,20000)).play(); // 4-cycle LFO modulating the high pass cutoff between 10000 and 20000 Hz`
---
- **lpf** ( _cutoffPattern_ )
	- applies a low pass filter with configurable `cutoffPattern` and `q` to the FacetPattern.
	- example:
		- `$('example').noise(n1).lpf(1000,6).times(0.1).play(); // low-passed noise`
		- `$('example').noise(n1).lpf(_.sine(4).scale(10,2000)).play(); // 4-cycle LFO modulating the high pass cutoff between 10 and 2000 Hz`
---
- **pitch** (  _pitchShiftPattern_ )
	- pitch-shifts the FacetPattern. `pitchShiftPattern` values between 0 and 1 will lower the pitch; e.g. a value of 0.5 will shift it down an octave. Values higher than 1 will increase the pitch; e.g. a value of 2 will be an octave higher.
	- example:
		- `$('example').sine(100).shift(rf(0.5,2)); // sometimes lower pitch, sometimes higher pitch`
		- `$('example').sine(100).pitch(_.noise(16).scale(0.5,2)).play(); // pitch shifts a 100Hz wave at 16 places, sometimes lower and sometimes higher`
---
- **stretch** ( _shiftAmountPattern_ )
	- time-stretches the FacetPattern while preserving pitch. `shiftAmountPattern` values less than 1 will shorten its overall length; values greater than 1 will increase its length.
	- example:
		- `$('example').sine(100,n4).stretch(4).play(); // stretching a quarter note sine wave to last a whole note`
		- `$('example').noise(n1).stretch(_.ramp(0.125,4,16)).play().once(); // stretching a whole note of noise over 16 ramped values, starting at 8x faster and ending at 4x slower`
---
- **subtract** ( _FacetPattern_, _match_sizes_ = true )
	- subtracts the second FacetPattern from the first. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(100).subtract(_.cosine(50)).play();`
---
- **tanh** ( _gainPattern_ = 20 )
	- outputs the hyperbolic tangent function for the input FacetPattern, always returning values between -1 and 1. Higher `gainPattern` values will create more intense distortion.
	- example:
		- `$('example').phasor(1,20).times(10).tanh(6); // 0 0.995 0.9999 0.99999996 0.9999999999 0.999999999999 0.9999999999999996 1 1 1 1 1 1 1 1 1 1 1 1 1`
		- `$('example').sine(100).tanh(_.ramp(0,100,100)).play(); // ramping tanh distortion up on a 100Hz sine wave`
---
- **times** ( _FacetPattern_, _match_sizes_ = true)
	- multiplies the first FacetPattern by the second. If `match_sizes` is false, the output FacetPattern will be the longer pattern's length, and the "missing" values from the shorter pattern will be set to 0. If `match_sizes` is true, both FacetPatterns will be made the same size before the calculations occur.
	- example:
		- `$('example').sine(50).times(_.sine(50)).play();`

### Pattern modulators that must take a second FacetPattern as an argument
- **and** ( _FacetPattern_, _match_sizes_ = true )
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
- **equals** ( _FacetPattern_, _match_sizes_ = true )
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
- **sup** ( _FacetPattern_, _startPositionPattern_, _maxFrameSize_ = whole_note_samples )
	- superposes a second FacetPattern onto the first. The `startPositionPattern` value can be any value between 0 and 1, or an array, or a FacetPattern. It controls the relative position(s) in the input FacetPattern to begin superposing `FacetPattern`. The `maxFrameSize` value specifies the farthest sample value from the first FacetPattern, which would be equal to a `startPosition` of 1.
	- example:
		- `$('example').silence(n1).sup(_.randsamp(),0,n1).sup(_.randsamp(),0.5,n1).play(); // superpose two samples at the 0% and 50% points through each loop`

### Pattern modulators with a function as one of the arguments

- **mix** ( _wet_, _command_ )
	- Mixes the input FacetPattern with a second FacetPattern generated by `command`.
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
- **parallel** ( _commands_ )
	- applies multiple commands in parallel to the input FacetPattern. The `commands` parameter is an array where each entry is a function. Each `command` is applied to a copy of the original input data, and the results are combined back together afterwards. The final output is normalized to have the same maximum value as the original input data.
	- example: `$('s').noise(n4).scale(-1,1).allpass(347).allpass(113).allpass(37).parallel([()=>{this.delay(1687,0.999)},()=>{this.delay(1601,0.999)},()=>{this.delay(2053,0.999)},()=>{this.delay(2251,0.999)}]).play().full(); // schroeder reverb on a quarter note of noise`
---
- **slices** ( _num_slices_, _commands_ = function, _prob_ = 1 )
	- slices the FacetPattern into `num_slices` slices, and for `prob` percent of those slices, runs `commands`, appending all slices back together. You can refer to the current slice of the algorithm via the reserved word: `this` (see example).
	- The variable `s`, referring to the current slice number starting at 0, is also available for use in commands.
	- The variable `num_slices`, referring to the number of slices, is also available for use in commands.
	- example:
		- `$('example').randsamp().slices(32,()=>{this.fft().shift(random()).ifft()}).play();`
---
- **sometimes** (_prob_, _operations_)
	- runs a chain of operations only some of the time, at a probability set by `prob`.
	- The command that will be mixed must start with the reserved word: `this` (see example).
	- example:
		- `$('example').phasor(1).sticky(0.5).scale(40,80).sometimes(0.5,()=>this.reverse());`
---

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