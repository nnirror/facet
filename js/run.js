const {parentPort, workerData} = require("worker_threads");
const strip = require('strip-comments');
const fs = require('fs');
const FacetPattern = require('./FacetPattern.js')
const stop_called_regex = /(?<!{[^}]*)\.stop\(\)(?![^{}]*})/;
const bpm_called_regex = /^(?!\s*\/\/).*\.bpm\(\s*[^)]*\)/m;
const fp_name_regex = /\$\((['"])(.+?)\1\)/;
let bpm_from_env;

parentPort.postMessage(runCode(workerData.code,workerData.mode,workerData.vars,workerData.env,workerData.utils,workerData.is_rerun));

function runCode (code,mode,vars,env,utils,is_rerun) {
  let fps = [];
  let run_errors = [];
  user_input = strip(code);
  user_input = delimitEndsOfCommands(user_input);
  let commands = splitCommandsOnDelimiter(user_input);
  Object.values(commands).forEach(command => {
    let original_command = replaceDelimiterWithSemicolon(command);
    command = formatCode(command);
    if ( mode === 'stop' ) {
      command = `${command}.stop()`;
    }
    if ( mode === 'keep' ) {
      command = `${command}.keep()`;
    }
    if ( mode === 'once' ) {
      command = `${command}.once()`;
    }
    let new_vars = generateVarsString(vars);
    new_vars = addMissingVariables(command, new_vars);
    try {
      let fp;
      let should_be_stopped = stop_called_regex.test(command);
      let is_bpm_command = bpm_called_regex.test(command);
      if ( should_be_stopped === true ) {
        // without processing the command, create a FacetPattern that will be passed 
        // to the transport where it will stop playback for this pattern
        fp = new FacetPattern(command.match(fp_name_regex)[2]);
        // if a command controls BPM, that information needs to be preserved
        if ( is_bpm_command ) {
          fp.bpm_pattern = true;
        }
        fp.is_stopped = true;
      }
      else {
        // set these globally so that any commands that eval patterns during their construction like iter() can access them too
        global.env = env;
        global.vars = new_vars;
        global.is_rerun = is_rerun;
        global.utils = utils;
        fp = eval(env + new_vars + utils + command);
      }
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

function addMissingVariables(command, vars) {
  let regex = /\.set\((.+?)\)/g;
  let matches = command.match(regex);

  if (matches) {
    matches.forEach(match => {
      let variableName = match.split('(')[1].split(')')[0].split(',')[0];
      variableName = variableName.replace(/['"]+/g, '');
      if (!vars.includes(`var ${variableName} =`)) {
        vars += `var ${variableName} = 0;\n`;
      }
    });
  }
  return vars;
}

function generateVarsString(obj) {
  let varsString = '';
  for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
          varsString += `var ${key} = [${obj[key].join(', ')}];\n`;
      }
  }
  return varsString;
}