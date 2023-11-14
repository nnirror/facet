# Fluid BPM

You can change the BPM of the Facet transport by including the `.bpm()` method on a FacetPattern.

To set the BPM to 120:

`$('example').bpm(120);`

To set the BPM to a sine wave, moving between 60 BPM to 180 BPM:

`$('example').bpm(_.sine(1).scale(60,180));`

To shuffle around a bunch of related tempos (e.g. half speed, double speed):

`$('example').bpm(_.from([40,80,80,60,160,160,160]).shuffle());` 

Higher BPMs are included more frequently in the above command so that they last the same relative amount of time as the lower BPM.

---

**NOTE**: Especially when using methods like `stretchto()`, keep in mind that while the current loop is playing, Facet is generating the data for the next loop.

So if the BPM is very low when a FacetPattern is generated, and you have specified that the next FacetPattern needs to last `n1` samples, it will begin creating a file to last a very long time. For example, a whole note at 4 BPM is 60 seconds. If then the BPM shifts back up to higher values, and the loop completes relatively quickly, in some situations this can crash the server.