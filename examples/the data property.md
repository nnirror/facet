# FacetPattern.data

Every FacetPattern class instance has a property called `data`, which is a 1-dimensional array of its floating-point numbers:

```
$('example').noise(16);
// data: [-0.2485032583610156, 0.3540499500373042, -0.2919989600808308, -0.7578058458819728, -0.020920700576734674, 0.6936482736893179, -0.8034306199317243, 0.44860374233348965, -0.4604511509631908, 0.3947098989795492, -0.5102994952874389, 0.9918695565958435, 0.8501005587583736, 0.13089835913255232, -0.17442391278343417, -0.6234140904900007]

$('example').from([1,1,2,3,5,8]).palindrome();
// data: [1,2,3,5,8,8,5,3,2,1,1]
```

This can be useful when you want to algorithmically control a number to use as an argument for other commands. For this example, let's assume you want to use the `comb()` method to generate comb filters with random intervals, but only intervals in c major.

First create a new FacetPattern:

`$('example').from(ri(36,84))` 

 This FacetPattern's `data` property is an array containing one random integer between 36 and 84.
 
 Via `.key()`, map that random integer onto the closest MIDI note in C major:

`$('example').from(ri(36,84)).key('c major')`

Now, via `.data[0]`, select the first element in the `data` array, which will be that random integer between 36-84 in C major:

`_.from(ri(36,84)).key('c major').data[0]`

Plug that into `mtos()` to convert that MIDI note number into an equivalent number of samples:

`mtos(_.from(ri(36,84)).key('c major').data[0]`

And plug that into the `.comb()` method, using a 16th note of noise for input to the comb filter. We now have a noise burst tuned to C major :)

`$('example').noise(n16).comb(mtos(_.from(ri(36,84)).key('c major').data[0]),0.9,0.9).play();`

Now superpose 16 of those, one at each 16th note position across the whole note:

```
$('example').silence(n1)
    .iter(16,()=>{
        this.sup(_.noise(n16)
            .comb(mtos(_.from(ri(36,84)).key('c major').data[0]),0.9,0.9)
        ,i/iters)})
    .play();
```

---

# FacetPattern.data.length


Since the `FacetPattern.data` property is a standard JavaScript array, we can also access its length property:

`$('example').noise(16).data.length // === 16`

This can be useful when developing certain algorithms, especially when the pattern length might be variable.

For example, say we want to always create 32-note pattern, but with a variable-size input pattern that can be 4, 8, 16, or 32 values long. Here is a description of one way to do that:

If the noise pattern is 4 values long, `.dup()` each value 7 times.
If the noise pattern is 8 values long,  `.dup()` each value 3 times.
If the noise pattern is 16 values long, `.dup()` each value 1 time.
If the noise pattern is 32 values long, do not `.dup()` each value.

Since the keyword `this` is only accessible inside certain functions (see the `using "this" methods.md` example file), we first run `.slices(1)` which will pass the entire pattern into a context where we can access its data via `this.data`.

Then we can run a JavaScript if-else statement, checking `this.data.length` and running `this.dup()` the appropriate number of times:


```
$('example')
  .noise(choose([4, 8, 16, 32]))
  .iter(1, () => {
  	if (this.data.length == 4) {
      this.dup(7)
    }
  	else if (this.data.length == 8) {
      this.dup(3)
    }
	else if (this.data.length === 16) {
      this.dup(1);
    }
  })
  .scale(36, 80)
  .note();
  ```

  Here's a more concise way to do the same thing without if-else:

  ```
$('example')
  .noise(choose([4, 8, 16, 32]))
  .iter(1, () => {
  	this.dup((32/this.data.length)-1)
  })
  .scale(36, 80)
  .note();
  ```