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
  exec(`${crossPlatformkillProcessCommand('facet_transport')}`, (error, stdout, stderr) => {
    exec(`${crossPlatformkillProcessCommand('facet_pattern_generator')}`, (error, stdout, stderr) => {
      res.sendStatus(200);
      server.close(() => {
        console.log(`Facet has shut down.`);
      });
    });
  });
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
  if ( process.platform == 'darwin' || process.platform == 'linux' ) {
    exec(`pkill ${process_name}`);
  }
  else if ( process.platform == 'win32' ) {
    if ( process_name == 'facet_transport' ) {
     exec(`netstat -ano | find "LISTENING" | find "3211"`, (error,stdout,stderr) => {
        let pid_str = stdout.split('LISTENING')[1].trim().split(' ')[0];
        exec(`taskkill /f /pid ${pid_str}`);
      })
    }
    else if ( process_name == 'facet_pattern_generator') {
      exec(`netstat -ano | find "LISTENING" | find "1123"`, (error,stdout,stderr) => {
        let pid_str = stdout.split('LISTENING')[1].trim().split(' ')[0];
        exec(`taskkill /f /pid ${pid_str}`);
      })
    }
  }
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
