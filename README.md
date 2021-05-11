# Facet: live coding for Max in the browser

## Overview

Facet is a flexible live coding system for controlling and applying synchronized algorithmic transformations to a Max patcher from a web browser. Any patcher can connect to Facet as long as you're running Max 8, and it can connect to Max for Live devices, too!

The language is similar to other live coding environments like [TidalCycles](https://tidalcycles.org/Welcome) and [Hydra](https://hydra.ojack.xyz/) where simple commands are chained together to create complex patterns. The patterns can be scaled, offset, modulated, shuffled, duplicated, and more into any range or scale.

Facet runs with minimal CPU overhead in Max, allows for sample-accurate parameter modulation up into the audio rate, and can produce both precise and surprising patterns.

## Getting started

Here's a [walkthrough video](https://youtu.be/aFzpexg-AdY) of the below installation steps.

1. Download Node.js and npm: https://www.npmjs.com/get-npm
2. Configure your local machine so it's running a web server. If you're not sure how to do this, Google "set up a local web server {your operating system here}." Facet is configured to work with your local web server running on 127.0.0.1.
3. Move the Facet repo into a subdirectory of your local web server.
4. In a terminal, while in the root of the facet repo, run `npm install`
5. Now in your browser, navigate to the Facet repo directory on your local web server. For example, on my machine (OSX Catalina): http://127.0.0.1/~cella/facet/ A blank code editor with a single comment in it should appear:
```
// Facet: live coding in the browser for Max
```
6. Open Max and add the Facet repo and all subdirectories to your file preferences.
7. In Max, open one of the .maxpat files in the /examples folder. They have sample commands to run for testing.
	- `example_facet_basics.maxpat` has a few simple examples
	- `example_facet_debug.maxpat` dispays the pattern in Max that's created by Facet
	- `example_facet_drum_generator.maxpat` synthesizes some drum sounds
	- `example_facet_drums.maxpat` sequences 4 drum samples
	- `example_facet_midi.maxpat` generates MIDI note data
	- `example_facet_m4l_fm.amxd` connects to Max for Live
8.	Copy those commands into the code editor in the browser. Move your cursor so it's on the line or block you want to run (All commands not separated by two blank lines will run together). Hit ctrl+enter to run the command(s). They should briefly highlight to illustrate what commands ran.
9.	Those commands should go from your local web server into Max. If you copied the command from an example file, the it should work and begin modulating one of the parameters in the Max patcher without any additional configuration.

## Facet command structure

Here is the general structure of a Facet command:

`destination property [datum].operations();`

**Note**: there are a several exceptions for global commands, such as `mute()`, `every()`, `clearevery()`, and `sometimes()`. Please see the command reference further below in the document for more details.

### Destination and Property

The "destination" and "property" values can be anything, as long as both values match the ones in the corresponding object in your Max patcher (more on this later). They should also be alphanumeric strings and contain no spaces.

Example of a valid destination and property:

```
kick resonance
foo bar
123_456 this_is_valid_but_silly
synth note
```
Examples of an invalid destination and property:

```
bongo fury amount	// must be 2 words with only whitespace between
friend's synth		// technically it will work, but it messes up the code formatting in the browser
kgs; asld!#		// the semicolon causes a parsing error
```

### Datum

The "datum" is the seed of data for the pattern that Facet ultimately generates. It must be enclosed in brackets, e.g. `[]`, and it has a maximum length of 1024. (If the datum ends up being longer than 1024, it will get rescaled to under 1024 before going to Max).

There are two ways to program the contents of a datum:

1. Manually enter numbers between the brackets. With this approach you can create nested arrays, where each higher level of the array will correspond to half as much time as the previous level when the array gets translated into a pattern in Max.

So here's an example nested datum and how it would translate into a pattern in Max:

```
[1 [2 [3]]] /* a manually programmed nested datum */
1 1 1 1 2 2 3 /* the resulting scaled pattern in Max */
```

The value `3` is nested twice, so it happens half as many times as the value `2`. Similarly, the `2` is nested once, so it happens half as many times as the `1`, which is at the root level of the array.

All of the following are valid examples of a manually programmed datum :

```
[1 -0.4 2.5]
[1 0 1 0 3 3 0 0.5 [1 1 1 0 0 0 1 0] [0 1 [1 2 3 4] 0]]
[300]
```

2. You can also use a "generator" function to fill the datum (see command reference for more details). For instance:

```
[sine(3,100)]
// fill the datum with 3 sine cycles 0-1, each cycle having 100 values
[noise(64)]
// fill the datum with 64 random values between 0 and 1
[drunk(256, 0.05)]
/* fill the datum with a 0-1 random walk for 256 steps, each value
being maximum 0.05 times different than the previous number */
```

Note: you can also invoke certain other functions while programming the datum. For example:
```
[sine(random(1,20,1),choose([5,10,20,40,80]))]
/* fill the datum with {random integer between 1-20} sine cycles,
where each cycle has either 5, 10, 20, 40, or 80 values. */

```
You can also chain certain operations _after_ the datum, but before other processing operations, if you want the datum to have multiple discrete components:
```
[1 0].append(random(0,1,0))
// fill the datum with 1, then 0, then a random float 0-1
[noise(2)].append(choose([0,1]))
// the opposite: fill the datum with 2 random floats 0-1, then either a 1 or 0
[phasor(3,10)].append(square(3,10));
/* fill with 3 cycles of a phasor, 10 values each. Append a square wave
of the same length. */
```
### Operations
You can transform the datum by chaining it through a series of operations (see command reference for a list of all operations). Since most functions generate data in the 0-1 range, these operations can be useful for scaling the datum into a range that is suitable for whatever you're doing in Max. They can also reorder, reduce, phase-flip, saturate, truncate, etc. For example, here's a command from `example_facet_midi.maxpat`:

```
midi note [tri(1,50)].gain(12).map([0,2,4,5,7,9,11,12]).offset(60);
// in the datum: create a single triangle cycle with 50 values, going from 0 to 1.
/* in the operations:
	- multiply those values by 12 with gain(12), so the triangle goes from 0 to 12.
	- map all triangle values onto one of the following: [0,2,4,5,7,9,11,12]
		- (this filters the notes from a chromatic 12-tone scale into C major)
	- add an offset of 60 to each value, so the triangle is now playing an up/down arpeggio of C major notes in the middle of the register.
*/
```
And here's another example:
```
fm amt [noise(8)].sort().palindrome();
// the datum is 8 random values 0-1. sort them and create a palindrome:
```
All operations transform the datum and pass it on, with the exception of  `choose()` and `random()`, which can only be used as arguments to other operations, since they return a single number.

### Ending / formatting commands
All commands must end in a semicolon. You can run multiple commands in a single line:
```
k1 struct [1 0 0 0]; s1 struct [0 0 1 0];
/* k1 triggers at beginning of each global phasor cycle, and
s1 triggers halfway through */
```
And you can add tabs, newlines, and comments to commands. **Note: multiple newlines in a row denote different "blocks" of code, so multiple newlines should not be used in series for formatting purposes ** :

```
midi note
    [noise(12)].round().palindrome().quantize(choose([4,8,16]))
		.append(phasor(random(1,10,1),20).palindrome()
			.quantize(choose([2,4,6,8,12,16,20])))
		.gain(12).offset(60).prob(0.125).offset(choose([0,5,7])).clip(60,72);


every(4)  // this is a silly comment
		foo // this names the destination as 'foo'
bar		// here's a comment on the line where prop 'bar' is declared
      [noise(32)]					
          	.map([0.1, 0.2, 0.3, 0.5, 0.8])
          				.sort()
          .reverse().walk(0.25, 4);
foaso asd [sine(1,100)]; ko asdl [1 2 [3]]; // two commands in one line
```

## Debugging
In the bottom of the Facet application in the browser is a status window which indicates whether the browser is connected to Max, and an additional space where further context is provided if a command failed.

Due to the experimental nature of live coding, sometimes the commands you run will produce a different output than what you expect. In that case, a good first place to investigate is the order of operations in your commands. For example, these produce different output:

```
foo bar [1].offset(100).gain(10); // value is 1,010
foo bar [1].gain(10).offset(100); // value is 110
```

In many cases, it can be helpful to open the Developer Tools in the browser and inspect network traffic, to see exactly what data Facet is sending along. (In Chrome the tab is called "Network"). After you run a command, the request should appear in the Network tab. To see the data that Facet sent along to Max, click on the request in the Network tab and view its Form Data.

Facet sends HTTP requests to Max because the data payloads can be quite large (larger than OSC would allow). The HTTP requests are sent by default to a server in Max (thanks to Node for Max) which is listening on port 1123 of your local web server, so all the requests to Max are going to http://127.0.0.1:1123/.

A good next step is to double check the syntax of your operations. Some operations require arrays as arguments. Some operations require multiple arguments in a specific order. Check that all parentheses and brackets are starting and ending at the right place so that functions have the correct number of arguments, and check that the command ends with a semicolon.

It's also possible that during development of a new patcher, when refreshing the browser or opening and closing Max many times, you might occasionally need to refresh the page in your browser, or click into the `facet_server` object in the patcher , click `script stop` and then `script start` to restart the server in Max. Generally this should work automatically, but if you're doing rapid development things can get out of sync.

There is also a utility object, `facet_debug.maxpat`, which visualizes the Facet pattern in
Max, along with the minimum value, maximum value, and pattern length. Check out `example_facet_debug.maxpat` for an example.

Please also feel free to create issues on GitHub or contact me (michael.j.cella@gmail.com) if you have questions.

## Creating your own patches

First, add a `facet_server` object (`facet_server.maxpat`) to your patcher. This object handles the connection between Max and the live coding interface in the browser. Verify that Max is now connected to the Facet application in the browser by checking the status window at the bottom of the browser.

Then for each parameter in your patcher that you want to control, add a `facet_param` object. The `@destination` and `@prop` values must be specified when you create the object. So the structure would look like:

`facet_param @destination foo @prop bar`

The `facet_param` object outputs a signal, so you will need to use `snapshot~` if you want to use a number instead of a signal. Other than that, you can just connect it to whatever you want.

In some cases it might also be helpful to include a `slide~` or `rampsmooth~` object after the `facet_param` object, since the output from Facet is not smoothed at all, which can produce clicks when modulating certain parameters like gain, filter cutoff, etc. You might also want to put a `clip~` object to prevent the possibility of accidentally sending numbers much larger or smaller than what you were expecting.

Then open the Facet application in your browser, run commands to the destinations / properties you've built in Max, and voila!


## Command reference

### Single number generators
- **choose** ( _pattern_ )
	- returns a randomly selected value from a supplied pattern.
	- example:
		- `foo bar [1].append(choose(data([2,3]))); // returns 1 and either 2 or 3`
---
- **random** ( _min_, _max_, _int_mode_ )
	- returns a number between `min` and `max`. If int_mode is 1, returns an integer. Otherwise, returns a float by default. `min` is 0 by default, and `max` is 1 by default.
	- example:
		- `foo bar [0].append(random(0,1)); // returns 0 and a float between 0 and 1`
		- `foo bar [0].append(random())  // also returns 0 and a float between 0 and 1`
		- `foo bar [0].append(random(1,10,1)); // returns 0 and an int between 1 and 10`
---
### Pattern modulators
- **abs** ( )
	- returns the absolute value of all numbers in the pattern.
	- example:
		- `foo bar [sine(1,100)].offset(-0.3).abs(); // a wonky sine`
---
- **changed** ( _pattern_ )
	- returns a 1 or 0 for each value in the pattern. If the value is different than the previous value, returns a 1. Otherwise returns a 0. (The first value is compared against the last value in the pattern.)
	- example:
		- `foo bar [1 1 3 4].changed(); // 1 0 1 1`
---
- **clip** ( _min_, _max_ )
	- clips any numbers in the pattern to a `min` and `max` range.
	- example:
		- `foo bar [1 2 3 4].clip(2, 3); // 2 2 3 3 `
---
- **distavg** ( )
	- computes the distance from the average of the pattern, for each element in the pattern.
	- example:
		- `foo bar [0.1 4 3.14].distavg(); // -2.3133 1.5867 0.7267`
---
- **dup** ( _num_ )
	- duplicates the pattern `num` times.
	- example:
		- `foo bar [sine(1,100)].dup(random(2,4,1)); // sine has 2, 3, or 4 cycles `
---
- **echo** ( _num_ )
	- repeats the pattern `num` times, with decreasing amplitude each repeat.
	- example:
		- `foo bar [1].echo(5); // 0.666 0.4435 0.29540 0.19674 0.13103`
		- `foo bar [phasor(5,20)].echo(8); // phasor decreases after each 5 cycles `
---
- **flipAbove** ( _maximum_ )
	- for all values above `maximum`, it returns `maximum` minus how far above the value was.
	- example:
		- `foo bar [sine(1,1000)].flipAbove(0.2); // wonky sine`
---
- **flipBelow** ( _min_ )
	- for all values below `minimum`, it returns `minimum` plus how far below the value was.
	- example:
		- `foo bar [sine(1,1000)].flipBelow(0.2); // another wonky sine`
---
- **fft** ( )
	- computes the FFT of the pattern, translating the pattern data into "phase data" that could theoretically reconstruct the pattern using sine waves, but in this context is just a glitchy isomorphism.
	- example:
		- `foo bar [1 0 1 1].fft(); // 3 0 0 1 1 0 0 -1`
---
- **fracture** ( _max_chunk_size_ )
	- divides and scrambles the pattern into pieces, where no chunk is bigger than `max_chunk_size`, and all chunks will be larger than `max_chunk_size / 2`.
	- example:
		- `foo bar [phasor(1,1000)].fracture(100); // the phasor has shattered into pieces!`
---
- **invert** ( )
	- computes the `minimum` and `maximum` values in the pattern, then scales every number to the opposite position, relative to `minimum` and `maximum`.
	- example:
		- `foo bar [0 0.1 0.5 0.667 1].invert(); // 1 0.9 0.5 0.333 0`
---
- **fade** ( )
	- applies a crossfade window to the pattern, so the beginning and end are faded out.
	- example:
		- `foo bar [noise(1024)].fade();`
---
- **flattop** ( )
	- applies a flat top window to the pattern, which a different flavor of fade.
	- example:
		- `foo bar [noise(1024)].flattop();`
---
- **gain** ( _amt_ )
	- multiplies every value in the pattern by a number.
	- example:
		- `foo bar [0 1 2].gain(100); // 0 100 200`
		-  `foo bar [0 1 2].gain(0.5); // 0 0.5 1`
---
- **gt** ( _amt_ )
	- returns `1` for every value in the pattern greater than `amt` and `0` for all other values.
	- example:
		- `foo bar [0.1 0.3 0.5 0.7].gt(0.6); // 0 0 0 1`
---
- **gte** ( _amt_ )
	- returns `1` for every value in the pattern greater than or equal to `amt` and `0` for all other values.
	- example:
		- `foo bar [0.1 0.3 0.5 0.7].gte(0.5); // 0 0 1 1`
---
- **jam** ( _prob_, _amt_ )
	- changes values in the pattern.  `prob` (float 0-1) sets the likelihood of each value changing. `amt` is how much bigger or smaller the changed values can be. If `amt` is set to 2, and `prob` is set to 0.5 half the values could have any number between 2 and -2 added to them.
	- example:
		- `foo bar [drunk(128,0.05)].jam(0.1,0.7); // small 128 step random walk with larger deviations from the jam`
---
- **lt** ( _amt_ )
	- returns `1` for every value in the pattern less than `amt` and `0` for all other values.
	- example:
		- `foo bar [0.1 0.3 0.5 0.7].lt(0.6); // 1 1 0 0`
---
- **lte** ( _amt_ )
	- returns `1` for every value in the pattern less than or equal to `amt` and `0` for all other values.
	- example:
		- `foo bar [0.1 0.3 0.5 0.7].lte(0.5); // 1 1 1 0`
---
- **log** ( )
	- returns a logarithmic growth representation of the pattern, where values at the beginning are stretched out and values at the end are squished together.
	- example:
		- `foo bar [drunk(128,0.05)].log(); // getting into the percussive zone`
---
- **modulo** ( _amt_ )
	- returns the modulo i.e. `% amt` calculation for each value in the pattern.
	- example:
		- `foo bar [1 2 3 4].modulo(3); // 1 2 0 1`
---
- **normalize** ( )
	- scales the pattern to the 0 - 1 range.
	- example:
		- `foo bar [sine(1,100)].gain(4000).normalize(); // the gain is undone!`
		- `foo bar [sine(1,100)].scale(-1, 1).normalize(); // works with negative values`
---
- **offset** ( _amt_ )
	- adds `amt` to each value in the pattern.
	- example:
		- `foo bar [sine(4,40)].offset(-0.2); // sine's dipping into negative territory`
---
- **palindrome** ( )
	- returns the original sequence plus the reversed sequence.
	- example:
		- 	 `foo bar [0 1 2 3].palindrome(); // 0 1 2 3 3 2 1 0`
---
- **pong** ( _min_, _max_ )
	- folds pattern values greater than `max` so their output continues at `min`.  If the values are twice greater than `max`, their output continues at `min` again. Similar for values less than `min`, such that they wrap around the min/max thresholds.
	- example:
		- `foo bar [sine(1,1000)].offset(-0.1).pong(0.2,0.5); // EZ cool waveform ready to normalize`
---
- **pow** ( _expo_ )
	- stretches a pattern according to an exponential power, similar to log where the values at the beginning can be stretched for a significant portion of the pattern, and the values at the end can be squished together.
	- example:
		- `foo bar [sine(5,200)].pow(6.5); // squished into the end`
		-  `foo bar [sine(5,200)].pow(6.5).pow(6.5); // VERY squished at the end`
		-  `foo bar [sine(5,200)].pow(0.5) // squished at the beginning, and kinda "bit-reduced"`
---
- **prob** ( _amt_ )
	- sets some values in the pattern to 0. `prob` (float 0-1) sets the likelihood of each value changing.
	- example:
		- `foo bar [1 2 3 4].prob(0.5); // 1 0 3 0 first time it runs`
		- `foo bar [1 2 3 4].prob(0.5); // 0 0 3 4 second time it runs`
		-  `foo bar [1 2 3 4].prob(0.5); // 0 2 3 4 third time it runs`
---
- **quantize** ( _resolution_ )
	- returns `0` for every step in the pattern whose position is not a multiple of `resolution`.
	- example:
		- `foo bar [drunk(16,0.5)].quantize(4); // 0.5241 0 0 0 0.7420 0 0 0 1.0 0 0 0 0.4268 0 0 0`
---
- **range** ( _new_min_, _new_max_ )
	- returns the subset of the pattern from the relative positions of `new_min` (float 0-1) and `new_max` (float 0-1).
	- example:
		- `foo bar [0.1 0.2 0.3 0.4].range(0.5,1); // 0.3 0.4`
---
- **recurse** ( _prob_ )
	- randomly copies portions of the pattern onto itself, creating nested, self-similar structures. `prob` (float 0-1) sets the likelihood of each value running a recursive copying process.
	- example:
		- `foo bar [1 2 [3] 4].recurse(0.25); // 1 2 3 2 2 3 3 1 2 3 4`
---
- **reduce** ( _new_size_ )
	- reduces the pattern length to `new_size`. If `new_size` is larger than the pattern length, no change. The values for the smaller array are interpolated from across the original array, preserving the structure as much as possible.
	- example:
		- `foo bar [1 2 3 4].reduce(2); // 1 3`
---
- **rerun** ( _num_ )
	- reruns the datum and operations preceding the rerun command, appending the results of each iteration to the pattern. If the commands that are being rerun have elements of randomness in them, each iteration of rerun will be potentially unique. This is different than dup(), where each copy is identical.
	- example:
		- `foo bar [phasor(1,random(10,50,1))].rerun(random(1,6,1)); // run a phasor between 2 and 7 times total, where each cycle will have a random number between 10 and 50 values in its cycle.`
---
- **reverse** ( )
	- returns the reversed pattern.
	- example:
		- `foo bar [phasor(1,1000)].reverse(); // go from 1 to 0 over 1000 values`
---
- **round** (  )
	- rounds all values in the pattern to an integer.
	- example:
		- `foo bar [0.1 0.5 0.9 1.1].round(); // 0 1 1 1`
---
- **saheach** ( _n_ )
	- samples and holds every `nth` value in the pattern until the next `nth` pattern.
	- example:
		- `foo bar [phasor(1,20)].saheach(2); // 0 0 0.1 0.1 0.2 0.2 0.3 0.3 0.4 0.4 0.5 0.5 0.6 0.6 0.7 0.7 0.8 0.8 0.9 0.9`
---
- **saturate** ( _gain_ )
	- runs nonlinear waveshaping (distortion) on the pattern, always returning values between -1 and 1.
	- example:
		- `foo bar [phasor(1,20)].gain(10).saturate(6); // 0 0.995 0.9999 0.99999996 0.9999999999 0.999999999999 0.9999999999999996 1 1 1 1 1 1 1 1 1 1 1 1 1`
---
- **scale** ( _new_min_, _new_max_ )
	- moves the pattern to a new range, from `new_min` to `new_max`. **Note**: this function will return the average of new_min and new_max if the pattern is only 1 value long. since you cannot interpolate where the value would fall in the new range, without a larger pattern to provide initial context of the value's relative position. This operation works better with sequences larger than 3 or 4.
	- example:
		- `foo bar [sine(10,100)].scale(-1,1); // bipolar signal`
---
- **shift** ( _amt_ )
	- moves the pattern to the left or the right. `amt` gets wrapped to values between -1 and 1, since you can't shift more than 100% left or 100% right.
	- example:
		- `foo bar [1 2 3 4].shift(-0.5); // 3 4 2 1`
---
- **shuffle** ( )
	- randomizes the pattern.
	- example:
		- `foo bar [1 2 3 4].shuffle(); // first time: 3 2 1 4`
		- `foo bar [1 2 3 4].shuffle(); // second time: 1 3 4 2`
---
- **smooth** ( )
	- interpolates each value so it falls exactly between the values that precede and follow it.
	- example:
		- `foo bar [noise(64)].smooth(); // less noisy`
---
- **sort** ( )
	- returns the pattern ordered lowest to highest.
	- example:
		- `foo bar [sine(1,100)].sort(); // a nice smoothing envelope from 0 to 1`
---
- **sticky** ( _amt_ )
	- samples and holds values in the pattern based on probability. `amt` (float 0-1) sets the likelihood of each value being sampled and held.
	- example
		- `foo bar [sine(1,1000)].sticky(0.98); // glitchy sine`
---
- **subset** ( _percentage_ )
	- returns a subset of the pattern with `percentage`% values in it.
	- example:
		- `foo bar [phasor(1,50)].subset(0.3); // originally 50 values long, now 0.02 0.08 0.50 0.58 0.62 0.700 0.76 0.78 0.92`
---
- **truncate** ( _length_ )
	- truncates the pattern so it's now `length` values long. If `length` is longer than the pattern, return the whole pattern.
	- example:
		- `foo bar [0 1 2 3].truncate(2); // now 2 values long`
		- `foo bar [0 1 2 3].truncate(6); // still 4 values long`
---
- **unique** ( )
	- returns the set of unique values in the pattern.
	- example:
		- `foo bar [1 2 3 0 0.4 2].unique(); // 1 2 3 0 0.4`
---
- **walk** ( _prob_, _amt_ )
	- changes positions in the pattern.  `prob` (float 0-1) sets the likelihood of each position changing. `amt` controls how many steps the values can move. If `amt` is set to 10, and `prob` is set to 0.5 half the values could move 10 positions to the left or the right.
	- example:
		- `foo bar [0 1 2 0 1 0.5 2 0].walk(0.25, 3); // a sequence for jamming`
---
### Pattern modulators with a second pattern as argument
- **add** ( _pattern_ )
	- adds the first pattern and the second pattern.
	- example:
		- `foo bar [sine(1,100)].add(data([0.5, 0.25, 0.1, 1]));`
- **and** ( _pattern_ )
	- computes the logical AND of both patterns, returning a 0 if one of the values is 0 and returning a 1 if both of the values are nonzero.
 If one pattern is smaller, it will get scaled so both patterns equal each other in size prior to running the operation.
	- example:
		- `foo bar [1 0 1 0].and(data([0,1])); // 0 0 1 0`
---
- **append** ( _pattern_ )
	- appends the second pattern onto the first.
	- example:
		- `foo bar [sine(1,100)].append(phasor(1,100)).append(data([1,2,3,4]));`
---
- **divide** ( _pattern_ )
	- divides the first pattern by the second pattern.
	- example:
		- `foo bar [sine(1,100)].divide(data([0.5, 0.25, 0.1, 1]));`
---
- **equals** ( _pattern_ )
	- computes the logical EQUALS of both patterns, returning a 0 if the values don't equal each other and returning a 1 if they do.
 If one pattern is smaller, it will get scaled so both patterns equal each other in size prior to running the operation.
	- example:
		- `foo bar [1 2 3 [4 5]].equals(data([1,2,3,[4,6]])); // 1 1 1 1 1 1 1 0`

- **interlace** ( _pattern_ )
	- interlaces two patterns. If one pattern is smaller, it will be interspersed evenly throughout the other pattern.
	- example:
		- `foo bar [sine(1,100)].interlace(phasor(1,20));`
---
- **map** ( _pattern_ )
	- forces all values in the input pattern to be mapped onto a new set of values. The mapping pattern should have the same range as the input pattern. **Note the array syntax!**
	- example:
		- `foo bar [1 2 3 4].map([11, 12, 13, 14]); // 11 11 11 11`
		- `foo bar [1 2 3 4].scale(30, 34).map([31, 31.5, 32, 32.5]); // 31 31.5 32.5 32.5`
---
- **or** ( _pattern_ )
	- computes the logical OR of both patterns, returning a 0 if both of the values are 0 and returning a 1 if either of the values are nonzero.
	If one pattern is smaller, it will get scaled so both patterns equal each other in size prior to running the operation.
	- example:
		- `foo bar [1 0 1 0].or(data([0,1])); // 1 0 1 1`
---
- **nest** ( _pattern_ )
	- similar to append, but it appends the new pattern at the end of the input pattern as a nested array.
	- example:
		- `foo bar [1 0].nest([2,0]); // the array looks like [1,0,[2,0]] which flattens into 1 1 0 0 2 0 when sent into Max`
---
- **subtract** ( _pattern_ )
	- subtracts the second pattern from the first pattern.
	- example:
		- `foo bar [sine(1,100)].subtract(data([0.5, 0.25, 0.1, 1]));`
---
- **times** ( _pattern_ )
	- multiplies the first pattern by the second pattern (amplitude modulation).
	- example:
		- `foo bar [sine(1,100)].times(data([0.5, 0.25, 0.1, 1]));`
---

### Pattern generators
- **cosine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `foo bar [cosine(2,30)]; // 2 cycles, 30 values each`
---
- **data** ( _pattern_ )
	- allows the user to specify their own pattern. **Note the array syntax!**
	- example:
		- `foo bar [data([1,2,3,4])]; // kinda silly since you could just say [1 2 3 4]`
---
- **drunk** ( _length_, _intensity_ )
	- generates a random walk of values between 0 and 1 for `length` values. `intensity` controls how much to add.
	- example:
		- `foo bar [drunk(16), 10];`
---
- **mult** ( _destination_and_property_ )
	- copies the output pattern from a command in the same block that has already run, allowing you to reuse and potentially continue transforming a single pattern for multiple destinations.
	- example:
		- `foo fizz [1 2 3 4].shuffle(); // i am a random sequence of 1, 2, 3,and 4 `
		- `foo buzz [mult('foo fizz')].reverse(); // i am a reversed copy of that`
	- You can use a mult anywhere that a pattern generator could go:
		-	`foo one [1 2 3 4];`
		- `foo two [drunk(16,0.1)];`
		- `foo three [mult('foo one')].gain(0.1).times(mult('foo two'));`

- **noise** ( _length_ )
	- generates a random series of values between9 0 and 1 for `length`.
	- example:
		- `foo bar [noise(1024)]; // lots of randomness`
---
- **phasor** ( _periods_, _length_ )
	- ramps from 0 to 1 for `periods` periods, each period having length `length`.
	- example:
		- `foo bar [phasor(10,100)]; // 10 ramps`
---
- **ramp** ( _from_, _to_, _size_ )
	- moves from `from` to `to` over `size` values.
	- example:
		- `foo bar [ramp(250,100,1000)]; // go from 250 to 100 over 1000 values`
---
- **sine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `foo bar [cosine(2,30)]; // 2 cycles, 30 values each`
---
- **square** ( _periods_, _length_ )
	- generates a square wave (all 0 and 1 values) for `periods` periods, each period having `length` values.
	- example:
		- `foo bar [square(5,6)]; // 5 cycles, 6 values each`
---
- **turing** ( _length_ )
	- generates a pattern of length `length` with random 1s and 0s.
	- example:
		- `foo bar [turing(64)]; // instant rhythmic triggers`
- **tri** ( _periods_, _length_ )
- generates a triangle wave for `periods` periods, each period having `length` values.
	- example:
		- `foo bar [triangle(30,33)]; // 30 cycles, 33 values each`
---
### Special operators

- **every** ( _times_ )
	- It's possible to specify an optional prefix to any block of Facet commands which will cause the block to re-evaluate at whatever frequency is specified.  **Note: the global transport must be enabled in Max for every() commands to run in the Browser, since they receive bangs from Max at whatever tempo is specified. **So for example:

```
every(4) lp cutoff noise[1].gain(3000);
// select a new random number between 0 and 3000 every 4 quarter notes
every(1) lp reso [sine(random(1,6,1),100)].scale(0,0.7);
// run a sine wave between 1-6 times every quarter note, going from 0 to 0.7
```

By default, Max sends a "bang" message to the Facet application in the browser every quarter note. Hence the every(4) and every(1) example above. (You could, of course, edit the `metro` object to run at a different speed in `facet_server.maxpat`).

It's also possible to specify a probability with every(), so that it will only run some of the time. By default, the every() commands have a probability of 1, meaning they will always run. For example:
```
every(4, 0.25) lp cutoff noise[1].gain(3000);
// every 4 quarter notes, 25% of the time, select a new random number between 0 and 3000
```
---
- **clearevery** (_times_)
	- clears any currently-running `every()` processes from memory. _Note:_ `mute();` also clears all `every()` processes.

If you want to clear a specific `every()` process, e.g. one running every 4, you would run `clearevery(4);`.

---
- **mute** ( )
	- Sets every `facet_param` object in the Max patch to 0.
		- example:
		- `mute(); // stops all patterns from running`
---
- **sometimes** (_prob_, _operations_)
	- runs a chain of operations only some of the time, at a probability set by `prob`.
```
midi note [phasor(1,100)].sticky(0.5).scale(40, 80).sometimes(0.5, 'reverse()');
// half the time, pattern goes up; half the time, it goes down
every(1) foo bar [drunk(16,0.1)].sometimes(0.5, 'sort().palindrome()');
// run a sequence that sometimes is random and sometimes goes up and down
```
---
- **speed** ( _amt_ )
	- changes the amount of time that it takes to loop through all values in a pattern. It should be specified in a separate command, such as:
```
foo speed [2];
kick1 speed [1 3 6 6];
```
**Note:** All destinations with the specified name will now run at that speed. For example:

```
kick1 gain [0.5 1 0];
kick1 filter [sine(3,1000)];
kick1 speed [2];
/* kick1 gain and kick1 filter are both running at speed 2 now
because they share a destination "kick1"*/
```

There are 14 possible speeds to choose from, all of which are in 1:n or n:1 relations with the global transport tempo in Max. (So they all stay in sync with each other).

Here is a mapping of possible `amt` values with their corresponding speeds in Max:

-8 = completes pattern over 8 whole notes

-7 = completes pattern over 7 whole notes

-6 = completes pattern over 6 whole notes

-5 = completes pattern over 5 whole notes

-4 = completes pattern over 4 whole notes

-3 = completes pattern over 3 whole notes

-2 = completes pattern over 2 whole notes

-1 / 0 / 1 = default, completes pattern over 1 whole note

2 = completes pattern over 1/2 whole note

3 = completes pattern over 1/3 whole note

4 = completes pattern over 1/4 whole note

5 = completes pattern over 1/5 whole note

6 = completes pattern over 1/6 whole note

7 = completes pattern over 1/7 whole note

8 = completes pattern over 1/8 whole note

## Future development ##

Below are a few ideas for future development. Ideas and feedback are welcome. Thanks!

- Ability to run conditional logic in operations
- Ability to view a reference of commands via a key combination
- Ability to highlight commands if they fail
- Ability to access some constants inside operations, like the global BPM in Max, the number of pattern cycles completed, total time elapsed, etc.
