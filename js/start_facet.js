// forked from https://stackoverflow.com/a/63235057 for cross-platform functionality.
// on Windows the 2nd server doesn't start if you chain the commands with &&
// inside the npm run script, so instead this process runs where it
// execs all the startup commands in a single function & is called when you run "npm run facet"
const child_process = require('child_process');
let cross_platform_slash = process.platform == 'win32' ? '\\' : '/';

// commands list
const commands = [
    {
        name: 'pattern generator start',
        command: `node js${cross_platform_slash}facet_server.js`
    },
    {
        name: 'transport start',
        command: `node js${cross_platform_slash}transport.js`
    }
];

// run command
function runCommand(command, name, callback) {
    child_process.exec(command, function (error, stdout, stderr) {
        if (stderr) {
            callback(stderr, null);
        } else {
            callback(null, `Successfully executed ${name} ...`);
        }
    });
}

// main calling function
function main() {
    commands.forEach(element => {
        runCommand(element.command, element.name, (err, res) => {
            if (err) {
                console.error(err);
            } else {
                console.log(res);
            }
        });
    });
}

// call main
main();