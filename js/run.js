const {parentPort, workerData} = require("worker_threads");
const commentStripper = require('./lib/strip_comments.js');
const fs = require('fs');
const FacetPattern = require('./FacetPattern.js')
let utils = fs.readFileSync('js/utils.js', 'utf8', (err, data) => {return data});
let env = fs.readFileSync('js/env.js', 'utf8', (err, data) => {return data});

parentPort.postMessage(runCode(workerData.code, workerData.vars));

function runCode (code, vars) {
  let fps = [];
  user_input = commentStripper.stripComments(code);
  let commands = user_input.trim().split(';').filter(Boolean);
  Object.values(commands).forEach(command => {
    let original_command = command;
    command = formatCode(command);
    let fp = eval(env + utils + command);
    fp.original_command = original_command;
    fps.push(fp);
  });
  return fps;
}

function formatCode (user_input) {
  user_input = user_input.replace(/\s\s+/g, '');
  user_input = user_input.replace(/\'/g, '"');
  user_input = user_input.replace(/;/g, ';\n');
  // anyonymous FacetPattern instantiation via "_." shorthand
  user_input = user_input.replace(/_\./g, '$().');
  return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
}
