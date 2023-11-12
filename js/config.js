let configSettings = {
  "OSC_OUTPORT": 5813,
  "SAMPLE_RATE": 44100,
  "EVENT_RESOLUTION_MS": 10,
  "EDITOR_OSC_OUTPORT": 8080
}

if ( typeof module !== 'undefined' && typeof module.exports !== 'undefined' ) {
  // nodeJS environment
  module.exports = {
    settings: configSettings
  }
} else {
  // browser environment
  window.configSettings = configSettings;
}