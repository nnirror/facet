const {parentPort, workerData} = require("worker_threads");
const commentStripper = require('./lib/strip_comments.js');
const fs = require('fs');
const FacetPattern = require('./FacetPattern.js')
let utils = fs.readFileSync('js/utils.js', 'utf8', (err, data) => {return data});
let env = fs.readFileSync('js/env.js', 'utf8', (err, data) => {return data});
let bpm_from_env;

parentPort.postMessage(runCode(workerData.code));

function runCode (code) {
  let fps = [];
  let run_errors = [];
  user_input = commentStripper.stripComments(code);
  user_input = delimitEndsOfCommands(user_input);
  let commands = splitCommandsOnDelimiter(user_input);
  Object.values(commands).forEach(command => {
    let original_command = replaceDelimiterWithSemicolon(command);
    command = formatCode(command);
    try {
      let fp = eval(env + utils + command);
      // parse the current BPM and add it as a property of the FP.
      // the BPM at generation time is needed in the transport - if BPM has changed
      // since the pattern was generated, it will play back at a corresponding
      // faster or slower speed
      let next_bpm_from_env = parseBpmFromEnv(env);
      if ( next_bpm_from_env !== null ) {
        fp.bpm_at_generation_time = next_bpm_from_env;
        bpm_from_env = next_bpm_from_env;
      }
      else {
        fp.bpm_at_generation_time = bpm_from_env;
      }
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
      let failed_fp = new FacetPattern(original_command);
      failed_fp.original_command = original_command;
      failed_fp.executed_successfully = false;
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
  if ( process.platform == 'win32' ) {
    // escape any single-slash \ characters in the command on windows only
    user_input = user_input.replace(/\\(?!\\)/g, '\\\\');
  }
  return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
}

function delimitEndsOfCommands (code) {
  let out = '';
  let scope_depth = 0;
  for (let x = 0, c=''; c = code.charAt(x); x++) {
    if ( c === '{' ) {
      scope_depth++;
    }
    else if ( c === '}' ) {
      scope_depth--;
    }
    if ( c === ';' && scope_depth === 0 ) {
      // end of command found. replace with delimiter '>|<',
      // to be changed back into a semicolon prior to evaluation.
      out += '>|<';
    }
    else {
      out += c;
    }
  }
  return out;
}

function replaceDelimiterWithSemicolon (command) {
  return command.replace('>|<', ';');
}

function splitCommandsOnDelimiter (user_input) {
  return user_input.trim().split('>|<').filter(Boolean);
}

function parseBpmFromEnv(env_str) {
  const match = env_str.match(/bpm=[\d]+[.]*[\d]+/gm);
  return match ? match[0].split('bpm=')[1] : null;
}