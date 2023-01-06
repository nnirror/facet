const { exec } = require('child_process');
const fs = require('fs');
const express = require('express');
const app = express();
const child_process = require('child_process');
const cors = require('cors');
app.use(cors());
const server = app.listen(5831);

process.title = 'facet_process_manager';

let cross_platform_slash = process.platform == 'win32' ? '\\' : '/';

app.post('/shutdown', (req, res) => {
  console.log(`shutting down Facet...`);
  exec(`pkill facet_pattern_generator && pkill facet_transport`, (error, stdout, stderr) => {
    server.close(() => {
      console.log(`Facet has shut down.`);
    });
  });
  res.sendStatus(200);
});

app.post('/restart', (req, res) => {
  console.log(`restarting Facet...`);
  exec(`${crossPlatformkillProcessCommand('facet_transport')}`, (error, stdout, stderr) => {
    exec(`${crossPlatformkillProcessCommand('facet_pattern_generator')}`, (error, stdout, stderr) => {
      main();
      res.sendStatus(200);
      console.log(`Facet has restarted.`);
    });
  });
});

function crossPlatformkillProcessCommand(process_name) {
  let cross_platform_command_str = '';
  if ( process.platform == 'darwin' || process.platform == 'linux' ) {
    cross_platform_command_str = `pkill ${process_name}`;
  }
  else if ( process.platform == 'win32' ) {
    cross_platform_command_str = `taskkill /ID ${process_name}.exe /F`;
  }
  return cross_platform_command_str;
}

// forked from https://stackoverflow.com/a/63235057 for cross-platform functionality.
// on Windows the 2nd server doesn't start if you chain the commands with &&
// inside the npm run script, so instead this process runs where it
// execs all the startup commands in a single function & is called when you run "npm run facet"
// commands list
const commands = [
    {
        name: 'pattern generator start',
        command: `node js${cross_platform_slash}pattern_generator.js`
    },
    {
        name: 'transport start',
        command: `node js${cross_platform_slash}transport.js`
    }
];

// run command
function runCommand(command, name, callback) {
    child_process.exec(command, (error, stdout, stderr) => {});
}

// main calling function
function main() {
    commands.forEach(element => {
        runCommand(element.command, element.name, (err, res) => {});
    });
}

// call main
main();
