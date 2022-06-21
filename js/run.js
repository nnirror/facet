const {parentPort, workerData} = require("worker_threads");
const commentStripper = require('./lib/strip_comments.js');
const fs = require('fs');
const FacetPattern = require('./FacetPattern.js')
let utils = fs.readFileSync('js/utils.js', 'utf8', (err, data) => {return data});

parentPort.postMessage(runCode(workerData.code, workerData.hook_mode, workerData.vars));

function runCode (code, hook_mode = false, vars) {
  let fps = [];
  let mousex = vars.mousex;
  let mousey = vars.mousey;
  user_input = commentStripper.stripComments(code);
  let commands = user_input.trim().split(';').filter(Boolean);
  Object.values(commands).forEach(command => {
    let original_command = command;
    command = removeTabsAndNewlines(command);
    let fp = eval(utils + command);
    fp.original_command = original_command;
    fps.push(fp);
  });
  return fps;
}

function removeTabsAndNewlines (user_input) {
  user_input = user_input.replace(/\s\s+/g, '');
  user_input = user_input.replace(/\'/g, '"');
  user_input = user_input.replace(/;/g, ';\n');
  return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
}
