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