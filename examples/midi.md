**Important:** you must connect the MIDI device you want to use before starting the Facet server.

# MIDI notes

1. via `.noise()`, create 16 values of noise between -1 and 1, and via `.scale()`, scale those values between 36 and 80. Via `.note()`, play them over the course of the loop, resulting in 16th notes with a default duration of 125 ms and default velocity of 100:
`mynotes.noise(16).scale(36,80).note();`

2. via `.key()`, map all the notes to the closet note in c major
`mynotes.noise(16).scale(36,80).key('c major').note();`

3. via `.chord()`, make each note a maj7 chord
`mynotes.noise(16).scale(36,80).key('c major').chord('maj7').note();`

4. instead of `.noise()`, create a sine wave via `.sine()` with 64 values to play those same notes:
`mynotes.sine(1).size(64).scale(36,80).key('c major').chord('maj7').note();`

5. add a dynamic velocity pattern, ramping from velocity 0 to velocity 127 over the course of the loop:
`mynotes.sine(1).size(64).scale(36,80).key('c major').chord('maj7').note(_.ramp(0,127,64));`

6. add dynamic duration, starting at 65ms per note at the beginning of the loop, ending at 1000ms per note:
`mynotes.sine(1).size(64).scale(36,80).key('c major').chord('maj7').note(_.ramp(0,127,64),_.from([65,125,250,500,1000]));`

7. assign to MIDI output channel 16:
`mynotes.sine(1).size(64).scale(36,80).key('c major').chord('maj7').note(_.ramp(0,127,64),_.from([65,125,250,500,1000]),16);`

8. via `.shuffle()`, randomize the note order:
`mynotes.sine(1).size(64).scale(36,80).shuffle().key('c major').chord('maj7').note(_.ramp(0,127,64),_.from([65,125,250,500,1000]),16);`

9. via `.sort()`, sort the notes in ascending order:
`mynotes.sine(1).size(64).scale(36,80).sort().key('c major').chord('maj7').note(_.ramp(0,127,64),_.from([65,125,250,500,1000]),16);`

10. via `.reverse()`, switch to descending note order:
`mynotes.sine(1).size(64).scale(36,80).sort().reverse().key('c major').chord('maj7').note(_.ramp(0,127,64),_.from([65,125,250,500,1000]),16);`

# MIDI cc

**Important:** to build MIDI mappings, send one command at a time into your DAW, and map any parameters you want with only that command running. Stop the command, move to a different command, and build more mappings on a different cc number.

The `.cc()` command expects input data to be scaled from `0 - 1`.

1. send a ramp from 0 to 1 out default cc number 70:
`mycc.ramp(0,1,128).cc();`

2. send the opposite out cc 71:
`mycc.ramp(1,0,128).cc(71);`

# MIDI pitchbend

The `.pitchbend()` command expects input data to be scaled from `-1 to 1`.

1. LFO pitchbend with one oscillation per loop of the Facet transport:
`mypitchbend.sine(1).size(128).pitchbend();`

2. out channel 16:
`mypitchbend.sine(1).size(128).pitchbend(16);`