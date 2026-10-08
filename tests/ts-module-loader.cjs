'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');
const { pathToFileURL } = require('node:url');

function resolveLocalTypeScriptModule(parentFilename, request) {
  if (!request.startsWith('.')) return null;

  const base = path.resolve(path.dirname(parentFilename), request);
  const candidates = [base, base + '.ts', path.join(base, 'index.ts')];
  return (
    candidates.find((candidate) => candidate.endsWith('.ts') && fs.existsSync(candidate)) ?? null
  );
}

function loadTypeScriptFile(filename, cache) {
  const cached = cache.get(filename);
  if (cached) return cached.exports;

  const source = fs
    .readFileSync(filename, 'utf8')
    .replace(/\bimport\.meta\.url\b/g, JSON.stringify(pathToFileURL(filename).href));
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const module = { exports: {} };
  cache.set(filename, module);

  const wrapper = new vm.Script(
    '(function (exports, module, require, __filename, __dirname) {' + transpiled + '\n})',
    { filename }
  ).runInThisContext();

  const localRequire = (request) => {
    const localTypeScriptFile = resolveLocalTypeScriptModule(filename, request);
    if (localTypeScriptFile) return loadTypeScriptFile(localTypeScriptFile, cache);
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), request);
      if (fs.existsSync(resolved)) return require(resolved);
    }
    return require(request);
  };

  wrapper(module.exports, module, localRequire, filename, path.dirname(filename));
  return module.exports;
}

function loadStandaloneTypeScriptModule(root, relativePath) {
  return loadTypeScriptFile(path.join(root, relativePath), new Map());
}

module.exports = { loadStandaloneTypeScriptModule };
