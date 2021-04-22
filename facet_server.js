const path = require('path');
const Max = require('max-api');
const bodyParser = require('body-parser');
const express = require('express')
const app = express();
var cors = require('cors')
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors())

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let total_cycles_occurred = 0;

async function checkForNewCycle(cycles_occurred_at_post_time, res) {
  // check for new cycle every 100ms. sends HTTP response to the
  // browser in sync with when the global phasor resets to 0
  if (total_cycles_occurred == cycles_occurred_at_post_time) {
    await sleep(100);
    await checkForNewCycle(cycles_occurred_at_post_time, res);
  }
  else {
    res.send('bang');
    res.sendStatus(200);
  }
}

app.post('/', function (req, res) {
  Max.outlet(req.body);
  res.sendStatus(200);
});

Max.addHandler('bang', () => {
	total_cycles_occurred++;
});

app.post('/time', function(req, res) {
  checkForNewCycle(total_cycles_occurred, res);
});

app.listen(1123);
