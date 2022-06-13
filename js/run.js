const {parentPort, workerData} = require("worker_threads");
const commentStripper = require('./lib/strip_comments.js');
const fs = require('fs');
const FacetPattern = require('./FacetPattern.js')
let utils = fs.readFileSync('js/utils.js', 'utf8', (err, data) => {return data});

parentPort.postMessage(runCode(workerData.code, workerData.hook_mode));

function runCode (code, hook_mode = false) {
  let fps = [];
  user_input = commentStripper.stripComments(code);
  let commands = user_input.trim().split(';').filter(Boolean);
  // might be good to see if this could be made more efficient in the future...
  // by splitting each the entire command from the HTTP request before it comes in here.
  // this would mean more worker threads, each one for a smaller piece of work.
  // it could mess up .set() / .get() retrieval of set patterns (although that would probably only be for the first .get() call)
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
