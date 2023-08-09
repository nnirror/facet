# synthesize a kick

1. via `.noise()`, generate a 64th note of noise, playing at position 0 each loop:
`$('kick').noise(n64).play();`

2. via `.lpf()`, add a low pass filter, moving from 250hz to 40hz, with a filter Q of 50, over the course of the 64th note of noise:
`$('kick').noise(n64).lpf(_.ramp(250,40,20),50).play();`

3. via `.times()`, apply an amplitude envelope with a second pattern, ramping from 1 to 0 over a 64th note:
`$('kick').noise(n64).lpf(_.ramp(250,40,20),50).times(_.ramp(1,0,n64)).play();`

4. via `.full()`, make the sound as loud as possible without clipping:
`$('kick').noise(n64).lpf(_.ramp(250,40,20),50).times(_.ramp(1,0,n64)).full().play();`

# synthesize hi hats

1. via `.noise()`, generate a 32nd note of noise, playing at position 0 each loop:
`$('hats').noise(n32).play();`

2. via `.play()`, play at positions 0, 0.25, 0.5, and 0.75 each loop:
`$('hats').noise(n32).play([0,0.25,0.5,0.75]);`

3. via `.times()`, apply an amplitude envelope with a second pattern, ramping from 1 to 0 over a 32nd note:
`$('hats').noise(n32).times(_.ramp(1,0,n32)).play([0,0.25,0.5,0.75]);`

4. via `.log(0.9)`, warp the samples so more of them happen at the beginning, and the ending is stretched out significantly, imparting a downwards pitch shift:
`$('hats').noise(n32).times(_.ramp(1,0,n32)).log(0.9).play([0,0.25,0.5,0.75]);`

5. via `.times(0.3)`, decrease the volume a bit to fit in the mix with the other drums:
`$('hats').noise(n32).times(_.ramp(1,0,n32)).log(0.9).times(0.3).play([0,0.25,0.5,0.75]);`

# synthesize a snare

1. via `.noise()`, generate a quarter note of noise, playing at positions 0.25 and 0.75 each loop:
$('snare').noise(n4).play([0.25,0.75]);

2. via `.times()`, apply an amplitude envelope with a second pattern, ramping from 1 to 0 over a quarter note:
$('snare').noise(n4).times(_.ramp(1,0,n4)).play([0.25,0.75]);

3. via `.scale()` inside the `.ramp()` method, exponentially scale the ramp so values are weighted towards 0, creating a nonlinear envelope, similar to a drum transient energy burst:
`$('snare').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).play([0.25,0.75]);`

4. via `.times(0.7)`, decrease the volume a bit to fit in the mix with the other drums:
`$('snare').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).times(0.7).play([0.25,0.75]);`

# put it all together

1. play all three commands simultaneously to play a beat:
```
$('kick').noise(n64).lpf(_.ramp(250,40,20),50).times(_.ramp(1,0,n64)).full().play();
$('hats').noise(n32).times(_.ramp(1,0,n32)).log(0.9).times(0.3).play([0,0.25,0.5,0.75]);
$('snare').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).times(0.7).play([0.25,0.75]);
// check out how it sounds at different tempos :)
```

# extending the idea

1. via `.play(_.ramp(0,1,16))`, increase hi hat rate to play a note every 16th note:
`$('hats').noise(n32).times(_.ramp(1,0,n32)).log(0.9).times(0.3).play(_.ramp(0,1,16));`

2. via `.sometimes()`, only play half of those 16th note hi hats:
`$('hats').iter(32,()=>{this.sup(_.noise(n32).times(_.ramp(1,0,n32)).log(0.9).times(0.3).sometimes(0.5,()=>{this.times(0)}),i/iters)}).play();`

3. play the kick always at position 0, and 50% of the time also at position 0.5:
`$('kick').noise(n64).lpf(_.ramp(250,40,20),50).times(_.ramp(1,0,n64)).full().play(_.from([0]).sometimes(0.5,()=>{this.append(0.5)}));`

4. add a delay to kick and snare
```
$('kick').noise(n64).lpf(_.ramp(250,40,20),50).times(_.ramp(1,0,n64)).full().play(_.from([0]).sometimes(0.5,()=>{this.append(0.5)})).delay(n3).play();
$('hats').noise(n32).times(_.ramp(1,0,n32)).log(0.9).times(0.3).play(_.ramp(0,1,16));
$('snare').noise(n4).times(_.ramp(1,0,n4).scale(0,1,9)).times(0.7).delay(n6).play([0.25,0.75]);
```

