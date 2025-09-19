const { parentPort, workerData } = require("worker_threads");
const fs = require('fs');
const FacetPattern = require('./FacetPattern.js')
const stop_called_regex = /(?<!{[^}]*)\.stop\(\)(?![^{}]*})/;
const bpm_called_regex = /^(?!\s*\/\/).*\.bpm\(\s*[^)]*\)/m;
const fp_name_regex = /\$\((['"])(.+?)\1\)/;
let bpm_from_env;

parentPort.postMessage(runCode(workerData.code, workerData.mode, workerData.vars, workerData.env, workerData.utils, workerData.is_rerun));

function runCode(code, mode, vars, env, utils, is_rerun) {
  let fps = [];
  let run_errors = [];
  let command = code;
  if (mode === 'stop') {
    command = `${command}.stop()`;
  }
  if (mode === 'keep') {
    command = `${command}.keep()`;
  }
  if (mode === 'once') {
    command = `${command}.once()`;
  }
  let new_vars = generateVarsString(vars);
  new_vars = addMissingVariables(command, new_vars);
  try {
    let fp = new FacetPattern();
    let should_be_stopped = stop_called_regex.test(command) || mode == 'stop';
    let is_bpm_command = bpm_called_regex.test(command);
    if (should_be_stopped === true) {
      // without processing the command, create a FacetPattern that will be passed 
      // to the transport where it will stop playback for this pattern
      fp = new FacetPattern(command.match(fp_name_regex)[2]);
      // if a command controls BPM, that information needs to be preserved
      if (is_bpm_command) {
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
    // if the command is not a FacetPattern after evaluation, there is a syntax error in the command
    if (fp instanceof FacetPattern != true) {
      throw new Error(`syntax error in command: ${command}`);
    }
    // parse the current BPM and add it as a property of the FP.
    // the BPM at generation time is needed in the transport - if BPM has changed
    // since the pattern was generated, it will play back at a corresponding
    // faster or slower speed
    let next_bpm_from_env = parseBpmFromEnv(env);
    if (next_bpm_from_env !== null) {
      fp.bpm_at_generation_time = next_bpm_from_env;
      bpm_from_env = next_bpm_from_env;
    }
    else {
      fp.bpm_at_generation_time = bpm_from_env;
    }
    fp.original_command = code;
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
    let failed_fp = new FacetPattern(code);
    failed_fp.original_command = code;
    failed_fp.executed_successfully = false;
    fps.push(failed_fp);
    run_errors.push(e);
  }
  return {
    fps: fps,
    errors: run_errors
  };
}

function parseBpmFromEnv(env_str) {
  const match = env_str.match(/bpm=\d+(\.\d+)?/gm);
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