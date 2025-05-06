const strip = require('strip-comments');

module.exports = {
  delimitEndsOfCommands: (code) => {
    let out = '';
    let scope_depth = 0;
    for (let x = 0, c = ''; c = code.charAt(x); x++) {
      if (c === '{') {
        scope_depth++;
      }
      else if (c === '}') {
        scope_depth--;
      }
      if (c === ';' && scope_depth === 0) {
        // end of command found. replace with delimiter '>|<',
        // to be changed back into a semicolon prior to evaluation.
        out += '>|<';
      }
      else {
        out += c;
      }
    }
    return out;
  },

  replaceDelimiterWithSemicolon: (command) => {
    return command.replace('>|<', ';');
  },

  splitCommandsOnDelimiter: (user_input) => {
    return user_input.trim().split('>|<').filter(Boolean);
  },

  formatCode: (user_input) => {
    user_input = user_input.replace(/\s\s+/g, '');
    user_input = user_input.replace(/\'/g, '"');
    user_input = user_input.replace(/;/g, ';\n');
    // anyonymous FacetPattern instantiation via "_." shorthand
    user_input = user_input.replace(/_\./g, '$().');
    if (process.platform == 'win32') {
      // escape any single-slash \ characters in the command on windows only
      user_input = user_input.replace(/\\(?!\\)/g, '\\\\');
    }
    return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g, '');
  }
}