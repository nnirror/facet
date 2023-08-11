# what's this?

Some Facet commands accept a function as one of the arguments, and in certain cases, the keyword `this` is used to refer to the current FacetPattern that the function is processing. The keyword `this` does not have a global scope; it's only accessible inside of the below functions.

- `slices()`: slice a pattern into `n` slices and apply a different operation to each of them.
```
$('example').noise(n1).slices(32,()=>{
    this.times(rf())
}).play()

// slices a whole note of noise into 32 pieces and multiplies each slice by a random amount between 0 and 1
```
---
- `mix()`: mix the pattern with a copy of itself that can be modified in any way.
```
$('example').sine(100).mix(0.5,()=>{
    this.pitch(_.ramp(2,0.5,32))
}).full().play();

// mixes a 100Hz sine wave with a copy of itself ramping from 2x speed to 0.5x speed. (The .full() command is included so the mixture doesn't clip and is rescaled to all be values between -1 and 1.)
```
---
- `iter()`: iteratively run the same command in series `n` times. (Essentially a short-hand for copy-pasting the same command next to itself `n` times).
```
$('example').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).iter(20,()=>{
    this.delay(ri(100,10000))
}).full().play();

// a creates a quarter note transient noise burst, then runs it through 20 delays in series, each delayed by a random amount between 100 and 10000 samples, creating a crude reverberation
```
---
- `parallel()`: runs multiple commands in parallel to the pattern. Each command runs on a separate copy of the pattern, and the results are combined back together afterwards. The final output is normalized to have the same maximum value as the original pattern.
```
$('example').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).allpass(347).allpass(113).allpass(37).parallel([()=>{this.delay(1687,0.999)},()=>{this.delay(1601,0.999)},()=>{this.delay(2053,0.999)},()=>{this.delay(2251,0.999)}]).play().full();

// an implementation of the schroeder reverb algorithm: three allpasses in series, into 4 delay lines in parallel
```
        - 
- `sometimes()`: runs the code inside the function only some of the time, depending on the first argument.
```
$('example').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).sometimes(0.5,()=>{this.reverse()}).play();
// reversed half the time

$('example').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).sometimes(0.9,()=>{this.reverse()}).play();
// reversed 90% of the time

$('example').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).sometimes(0.1,()=>{this.reverse()}).play();
// reversed 10% of the time
```

