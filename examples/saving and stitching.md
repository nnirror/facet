# saving and stitching

#### saving 

Via `.saveas()`, you can save each loop to disk as a .wav file:

```
$('example').iter(16,()=>{
    this.sup(_.sine(mtof(ri(36,72)),n4).times(_.ramp(0.2,0,n4).scale(0,1,9)),i/iters)
}).saveas('myMelody/'+Date.now()).play();
```

When you run the above command, the `samples/myMelody` directory will be created if it doesn't exist.

**For Windows users**: you must use a backslash: `\` to specify the file path instead of the forward slash in the example.

Note how `Date.now()` is appended to each filename - this allows you to preserve the order that the files were generated. You could also use `Math.random()` any other techniques for giving each file a unique name. Without specifying a unique name for each file, the same file will get overwritten each loop.

If a file has been created with multiple channels via `.channels()` or with its audio panned between multiple channels via `.pan()`, the saved wav file will have that many channels.

#### stitching

Via `.stitchdir()`, you can stitch together a directory of .wavs into a single .wav with sample-accurate distance between each file.

```
$('example').stitchdir('myMelody',n1,'myStitchedMelody');
// stitch toegether a file called 'myStitchedMelody.wav' from every file
// in the 'samples/myMelody' directory, with a whole note (n1) between each file.

$('example').stitchdir('myMelody',_.from([n1,n2,n4,n8]),'myStitchedMelody');
// stitch toegether a file called 'myStitchedMelody.wav' from every file in 
// the 'samples/myMelody' directory, but the distance between each file is 
// cycling through a pattern: first it's a whole note (n1), then a half note (n2),
// then a quarter note (n4), then an eighth note (n8).
```

Note that `stitchdir()` uses the current BPM of the Facet transport to determine how many samples `n1` equals, so make sure to run it at the same BPM as what the files were generated at. Or you can try stitching it at different BPMs to overlap the wavs in different ways.

---
For more information, refer to the `saveas()` and `stitchdir()` entries in the README.md documentation.