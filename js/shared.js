const fs = require('fs');

module.exports = {
  cleanUp: () => {
    fs.writeFileSync('js/stored.json', '{}');
    fs.writeFileSync('js/reruns.json', '{}');
    fs.writeFileSync('js/patterns.json', '{}');
    fs.writeFileSync('js/hooks.json', '{}');
    fs.writeFileSync('js/env.js', '');
    fs.readdirSync('tmp/').forEach(f => fs.rmSync(`tmp/${f}`));
  },
  getHooks: () => {
    try {
      return JSON.parse(fs.readFileSync('js/hooks.json', 'utf8', (err, data) => {
        return data
      }));
    } catch (e) {
      return {};
    }
  },
  getPatterns: () => {
    try {
      return JSON.parse(fs.readFileSync('js/patterns.json', 'utf8', (err, data) => {
        return data
      }));
    } catch (e) {
      return {};
    }
  },
  getReruns: () => {
    try {
      return JSON.parse(fs.readFileSync('js/reruns.json', 'utf8', (err, data) => {
        return data
      }));
    } catch (e) {
      return {};
    }
  },
  initEnv: () => {
    fs.writeFileSync('js/env.js', '');
  },
  initStore: () => {
    fs.writeFileSync('js/stored.json', '{}');
  }
}
