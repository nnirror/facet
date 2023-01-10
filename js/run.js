const {parentPort, workerData} = require("worker_threads");
const commentStripper = require('./lib/strip_comments.js');
const fs = require('fs');
const FacetPattern = require('./FacetPattern.js')
let utils = fs.readFileSync('js/utils.js', 'utf8', (err, data) => {return data});
let env = fs.readFileSync('js/env.js', 'utf8', (err, data) => {return data});

parentPort.postMessage(runCode(workerData.code, workerData.vars));

function runCode (code, vars) {
  let fps = [];
  let run_errors = [];
  user_input = commentStripper.stripComments(code);
  let commands = user_input.trim().split(';').filter(Boolean);
  Object.values(commands).forEach(command => {
    let original_command = command;
    command = formatCode(command);
    try {
      let fp = eval(env + utils + command);
      fp.original_command = original_command;
      fps.push(fp);
    } catch (e) {
      // even if there was an error, still pass the command into fps.
      // because possibly the next time it runs, it might work - e.g.,
      // running get() in the same block where a pattern was set(),
      // or running sample() in the same block where the file is being
      // recorded via record(). in that case, the get() / record() commands
      // would fail the first time when the other FP hasn't been created yet,
      // but then would start to work. also, if a block of commands has a
      // bad command in it, that command will fail but the othe commands will
      // succeed because all exceptions are caught rather than thrown,
      // and the error messages from any caught exceptions are put into an
      // errors object which is then passed to the UI. graceful error handling
      let failed_fp = new FacetPattern();
      failed_fp.original_command = original_command;
      fps.push(failed_fp);
      run_errors.push(e);
    }
  });
  return {
    fps:fps,
    errors:run_errors
  };
}

function formatCode (user_input) {
  user_input = user_input.replace(/\s\s+/g, '');
  user_input = user_input.replace(/\'/g, '"');
  user_input = user_input.replace(/;/g, ';\n');
  // anyonymous FacetPattern instantiation via "_." shorthand
  user_input = user_input.replace(/_\./g, '$().');
  return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
}
