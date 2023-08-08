# OSC output

By default, Facet sends OSC out of port 5813. The OSC can go to any application; this document focuses on how to integrate with a Max patcher.

The "facet.maxpat" patcher in this repo will send all received OSC messages from its fifth outlet, to be used anywhere in Max:

```
-------------
|   facet   |
o--o--o--o--o
            |
            |
            |
            ----------------------------------
            | route /filter_cutoff /filter_q |
            ----------------------------------
```
Another alternative in Max if you'll only be using OSC is to create a "udpreceive 5813" object directly:

```
-------------------
| udpreceive 5813 |
o------------------
|
|
----------------------------------
| route /filter_cutoff /filter_q |
----------------------------------
```

Either way, as in both above examples, connect the OSC output to a "route" object. The OSC data from each Facet command will flow through to your Max patch.

Be sure to size your commands appropriately, via `.size()` so the OSC server isn't overwhelmed. It's intended to be used for control data.

1. send a LFO, scaled between 100 and 10000, to the `/filter_cutoff` address:
`$('my_filter_cutoff').sine(1).size(128).scale(100,1000).osc('/filter_cutoff');`

2. send 128 smoothed random values to the `/filter_q` address:
`$('my_filter_q').noise(16).curve().size(128).scale(30,80).osc('/filter_q');`