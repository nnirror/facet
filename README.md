# Facet: live coding in the browser for Max

## Overview

Facet is a live coding system for controlling and applying algorithmic transformations to a Max patcher from the web browser. Any patcher can connect to Facet (as log is you're running Max 8), and it can connect to Max for Live devices too!

It's easy to configure for your own purposes in Max, CPU-efficient, and can modulate parameters up into the audio rate with sample-accuracy since it's based on wavetables.

The language is similar in style to other live coding environments like TidalCycles and Hydra, where simple commands are chained together to create complex patterns. Functions generate data in the 0-1 range by default, but they can then be scaled, offset, modulated, shuffled, convolved, and more, into any number range or scale. This allows for highly precise operations. Need a signal going from 500-2000? No problem, add a .gain(1500).offset(500). Want to create a microtonal scale? Sick, add .map([0.1, 0.2, 0.3, 0.5, 0.8, 1.3, 2.1, 3.4, 5.5]) and every value will now be one of those 9 values.

## Getting started

1. Configure your local machine so it's running a web server. If you're not sure how to do this, Google something like "set up a local web server {your operating system here}."
2. Move the facet repo into a subdirectory of your local web server.
3. In your browser, navigate to the facet repo, which should now be available on your local web server. For example, on my machine: http://127.0.0.1/~cella/facet/
4. In Max, open one of the .maxpat files in the /examples folder. They each have some sample commands you can run for testing.
	- example_facet_basics.maxpat has a few simple examples.
	- example_facet_drums.maxpat sequences 4 drums samples.
	- example_facet_midi.maxpat generates MIDI note data.
	- example_facet_m4l_fm.amxd connects to Max for Live.
5.	Copy those commands into the code editor in the browser, and hit ctrl+enter to run any block of code. All commands NOT separated by two lines (i.e. in the same block) will run together. They should briefly highlight to illustrate what commands ran.
6.	If all went well, whatever commands you ran should have begun to modify a parameter in your Max patcher.

## Debugging

# How it works

The commands are sent from the browser to Max via HTTP. A Node for Max object, "facet_server"
