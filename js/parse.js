module.exports = {
  splitCommands: (code) => {
    const commands = [];
    let currentCommand = '';
    let scopeDepth = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      
      // handle string literals
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
        currentCommand += char;
      } else if (inString && char === stringChar) {
        // check if escaped
        let escapeCount = 0;
        let j = i - 1;
        while (j >= 0 && code[j] === '\\') {
          escapeCount++;
          j--;
        }
        if (escapeCount % 2 === 0) {
          inString = false;
          stringChar = '';
        }
        currentCommand += char;
      } else if (inString) {
        currentCommand += char;
      } else {
        // not in string - track scope and semicolons
        if (char === '{') {
          scopeDepth++;
          currentCommand += char;
        } else if (char === '}') {
          scopeDepth--;
          currentCommand += char;
        } else if (char === ';' && scopeDepth === 0) {
          // top-level semicolon = end of command
          const trimmed = currentCommand.trim();
          if (trimmed) {
            commands.push(trimmed);
          }
          currentCommand = '';
        } else {
          currentCommand += char;
        }
      }
    }
    
    const trimmed = currentCommand.trim();
    if (trimmed) {
      commands.push(trimmed);
    }
    
    return commands.filter(cmd => cmd.length > 0);
  },

  formatCode: (user_input) => {
    user_input = user_input.replace(/\s\s+/g, '');
    user_input = user_input.replace(/\'/g, '"');
    user_input = user_input.replace(/;/g, ';\n');
    // auto-wrap FacetPattern method calls in function syntax for specific methods
    user_input = module.exports.wrapFacetPatternArguments(user_input);
    // anyonymous FacetPattern instantiation via "_." shorthand
    // but only match underscores that are NOT inside quoted strings
    user_input = user_input.replace(/_\./g, (match, offset, string) => {
      // Check if this underscore is inside a quoted string
      const beforeMatch = string.substring(0, offset);
      const quotesBefore = (beforeMatch.match(/"/g) || []).length;
      // If odd number of quotes before, we're inside a string
      if (quotesBefore % 2 === 1) {
        return match; // Don't replace if inside quotes
      }
      return '$().';
    });
    // named FacetPattern instantiation via "_name" shorthand (allows names starting with numbers)
    // but only match underscores that are NOT inside quoted strings
    user_input = user_input.replace(/_([a-zA-Z0-9][a-zA-Z0-9_]*)\./g, (match, name, offset, string) => {
      // Check if this underscore is inside a quoted string
      const beforeMatch = string.substring(0, offset);
      const quotesBefore = (beforeMatch.match(/"/g) || []).length;
      // If odd number of quotes before, we're inside a string
      if (quotesBefore % 2 === 1) {
        return match; // Don't replace if inside quotes
      }
      return `$("${name}").`;
    });
    // named FacetPattern instantiation via bare "name" (no underscore prefix)
    // Use proper parsing to only replace at true statement boundaries
    user_input = module.exports.replaceBarePatternNames(user_input);
    if (process.platform == 'win32') {
      // escape any single-slash \ characters in the command on windows only
      user_input = user_input.replace(/\\(?!\\)/g, '\\\\');
    }
    return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g, '');
  },

  replaceBarePatternNames: (code) => {
    let result = '';
    let i = 0;
    
    while (i < code.length) {
      const char = code[i];
      
      // handle quoted strings - skip entire string content
      if (char === '"' || char === "'" || char === '`') {
        const quote = char;
        result += char;
        i++;
        
        // find the end of the string, handling escapes
        while (i < code.length) {
          const stringChar = code[i];
          result += stringChar;
          
          if (stringChar === quote) {
            i++;
            break;
          } else if (stringChar === '\\') {
            // skip escaped character
            i++;
            if (i < code.length) {
              result += code[i];
              i++;
            }
          } else {
            i++;
          }
        }
        continue;
      }
      
      // check if we're at a potential pattern name start
      if (/[a-zA-Z]/.test(char)) {
        // look ahead to see if this is a pattern (word followed by dot)
        const nameMatch = code.slice(i).match(/^([a-zA-Z][a-zA-Z0-9_]*)\./);
        
        if (nameMatch) {
          const fullMatch = nameMatch[0];
          const name = nameMatch[1];
          
          // check if we're at statement level (not inside any nesting)
          const beforePos = i;
          let nestLevel = module.exports.getNestingLevel(code, beforePos);
          
          // only replace if we're at statement level (nesting level 0)
          // AND the previous non-whitespace character suggests statement boundary
          const prevContext = module.exports.getPreviousContext(code, beforePos);
          
          if (nestLevel === 0 && module.exports.isValidPatternStart(prevContext)) {
            result += `$("${name}").`;
            i += fullMatch.length;
            continue;
          }
        }
      }
      
      result += char;
      i++;
    }
    
    return result;
  },

  getNestingLevel: (code, pos) => {
    let level = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < pos; i++) {
      const char = code[i];
      
      if (!inString) {
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
        } else if (char === '(' || char === '[' || char === '{') {
          level++;
        } else if (char === ')' || char === ']' || char === '}') {
          level--;
        }
      } else {
        if (char === stringChar) {
          // check if it's escaped
          let escapeCount = 0;
          let j = i - 1;
          while (j >= 0 && code[j] === '\\') {
            escapeCount++;
            j--;
          }
          // if even number of escapes (or none), the quote is not escaped
          if (escapeCount % 2 === 0) {
            inString = false;
            stringChar = '';
          }
        }
      }
    }
    
    return Math.max(0, level);
  },

  getPreviousContext: (code, pos) => {
    let i = pos - 1;
    
    // skip whitespace
    while (i >= 0 && /\s/.test(code[i])) {
      i--;
    }
    
    if (i < 0) return '^'; // start of string
    return code[i];
  },

  isValidPatternStart: (prevChar) => {
    return prevChar === '^' ||  // start of string
           prevChar === '{' ||  // start of block
           prevChar === ';' ||  // end of statement
           prevChar === '\n';   // new line
  },

  wrapFacetPatternArguments: (user_input) => {
    // methods that expect function arguments (except parallel(), which expects an array)
    const methods = ['spread', 'iter', 'sometimes', 'mix', 'drift', 'slices', 'subrange', 'dirsamp', 'slices2d', 'columns2d', 'seq'];
    
    for (const method of methods) {
      let targetArgIndex;
      switch (method) {
        case 'spread':
          targetArgIndex = 1;
          break;
        case 'iter':
          targetArgIndex = 1;
          break;
        case 'sometimes':
          targetArgIndex = 1;
          break;
        case 'mix':
          targetArgIndex = 1;
          break;
        case 'drift':
          targetArgIndex = 2;
          break;
        case 'slices':
          targetArgIndex = 1;
          break;
        case 'slices2d':
          targetArgIndex = 1;
          break;
        case 'columns2d':
          targetArgIndex = 1;
          break;
        case 'subrange':
          targetArgIndex = 2;
          break;
        case 'dirsamp':
          targetArgIndex = 2;
          break;
        case 'seq':
          targetArgIndex = 1;
          break;
        default:
          targetArgIndex = 1;
      }
      
      user_input = module.exports.wrapArgumentForMethod(user_input, method, targetArgIndex);
    }
    
    // handle parallel method separately since it expects an array of functions
    user_input = user_input.replace(/\.parallel\s*\(\s*\[([^\]]+)\]\s*\)/g, (match, arrayContents) => {
      const elements = module.exports.parseArrayElements(arrayContents);
      const transformedElements = elements.map(element => {
        const trimmedElement = element.trim();
        if (module.exports.shouldWrapArgument(trimmedElement)) {
          const dotIndex = trimmedElement.indexOf('.');
          if (dotIndex > -1) {
            const beforeDot = trimmedElement.substring(0, dotIndex);
            const afterDot = trimmedElement.substring(dotIndex);
            
            if (beforeDot.match(/^(_[a-zA-Z0-9_]*|\$\([^)]*\))$/)) {
              return `()=>{this${afterDot}}`;
            }
          }
        }
        return element;
      });
      
      return `.parallel([${transformedElements.join(',')}])`;
    });
    
    return user_input;
  },

  wrapArgumentForMethod: (input, methodName, targetArgIndex) => {
    let result = input;
    let pos = 0;
    
    while (true) {
      // find the next occurrence of the method
      const methodPattern = new RegExp(`\\.${methodName}\\s*\\(`, 'g');
      methodPattern.lastIndex = pos;
      const methodMatch = methodPattern.exec(result);
      
      if (!methodMatch) break;
      
      const methodStart = methodMatch.index;
      const argsStart = methodStart + methodMatch[0].length;
      
      // find the complete argument list by tracking parentheses
      let depth = 1;
      let argsEnd = argsStart;
      let inString = false;
      let stringChar = null;
      
      for (let i = argsStart; i < result.length && depth > 0; i++) {
        const char = result[i];
        
        if (!inString && (char === '"' || char === "'")) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && result[i-1] !== '\\') {
          inString = false;
          stringChar = null;
        }
        
        if (!inString) {
          if (char === '(') depth++;
          else if (char === ')') depth--;
        }
        
        argsEnd = i;
      }
      
      const argsString = result.substring(argsStart, argsEnd);
      const parsedArgs = module.exports.parseMethodArguments(argsString);
      
      if (parsedArgs.length > targetArgIndex) {
        const targetArg = parsedArgs[targetArgIndex].trim();
        
        if (module.exports.shouldWrapArgument(targetArg)) {
          const dotIndex = targetArg.indexOf('.');
          if (dotIndex > -1) {
            const beforeDot = targetArg.substring(0, dotIndex);
            const afterDot = targetArg.substring(dotIndex);
            
            if (beforeDot.match(/^(_[a-zA-Z0-9_]*|\$\([^)]*\))$/)) {
              parsedArgs[targetArgIndex] = `()=>{this${afterDot}}`;
              const newArgsString = parsedArgs.join(',');
              result = result.substring(0, argsStart) + newArgsString + result.substring(argsEnd);
              pos = argsStart + newArgsString.length;
              continue;
            }
          }
        }
      }
      
      pos = argsEnd;
    }
    
    return result;
  },

  shouldWrapArgument: (arg) => {
    const trimmed = arg.trim();
    
    // skip if already a function
    if (trimmed.startsWith('()=>{') || trimmed.startsWith('function')) {
      return false;
    }
    
    // skip if it's a string literal
    if (trimmed.match(/^["']/)) {
      return false;
    }
    
    // skip if it's just a number or basic expression without dots
    if (!trimmed.includes('.')) {
      return false;
    }
    
    // check if it looks like a FacetPattern method chain
    const dotIndex = trimmed.indexOf('.');
    if (dotIndex > -1) {
      const beforeDot = trimmed.substring(0, dotIndex);
      // should wrap if it starts with a FacetPattern variable or instantiation
      return beforeDot.match(/^(_[a-zA-Z0-9_]*|\$\([^)]*\))$/);
    }
    
    return false;
  },

  parseMethodArguments: (argsString) => {
    const args = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = null;
    
    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];
      
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && argsString[i-1] !== '\\') {
        inString = false;
        stringChar = null;
      }
      
      if (!inString) {
        if (char === '(' || char === '[' || char === '{') {
          depth++;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
        } else if (char === ',' && depth === 0) {
          args.push(current);
          current = '';
          continue;
        }
      }
      
      current += char;
    }
    
    if (current.trim()) {
      args.push(current);
    }
    
    return args;
  },

  parseArrayElements: (arrayString) => {
    return module.exports.parseMethodArguments(arrayString);
  }
}