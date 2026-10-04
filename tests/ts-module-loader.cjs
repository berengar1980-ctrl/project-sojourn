'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

function loadStandaloneTypeScriptModule(root, relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const module = { exports: {} };
  const wrapper = new vm.Script(
    '(function (exports, module, require, __filename, __dirname) {' +
      transpiled +
      '\n})',
    { filename }
  ).runInThisContext();

  wrapper(module.exports, module, require, filename, path.dirname(filename));
  return module.exports;
}

module.exports = { loadStandaloneTypeScriptModule };
