const path = require('path');
const Max = require('max-api');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
var cors = require('cors');
const OSC = require('osc-js');

const osc = new OSC({
  discardLateMessages: false,
  plugin: new OSC.WebsocketServerPlugin()
});
osc.open();

const handlers = {
  bang: () => {
    let message = new OSC.Message('/eoc', 'bang');
      osc.send(message);
  },
  hook: (...args) => {
    let message = new OSC.Message('/hook', args[0]);
    osc.send(message);
  },
  set: (...args) => {
    let message = new OSC.Message('/set', args[0], args[1]);
    osc.send(message);
  },
};

Max.addHandlers(handlers);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.post('/', function (req, res) {
  Max.outlet(req.body);
  res.sendStatus(200);
});

app.listen(1123);
