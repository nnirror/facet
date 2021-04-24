const path = require('path');
const Max = require('max-api');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
var cors = require('cors');
const OSC = require('osc-js');

const osc = new OSC({
  discardLateMessages: false, /* ignores messages which timetags lie in the past */
  plugin: new OSC.WebsocketServerPlugin() /* used plugin for network communication */
});
osc.open();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.post('/', function (req, res) {
  Max.outlet(req.body);
  res.sendStatus(200);
});

Max.addHandler('bang', () => {
  const message = new OSC.Message('/eoc', 'bang');
  osc.send(message);
});

app.listen(1123);
