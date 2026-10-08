'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Static UI contracts follow local module extraction without assuming one source file.
function readModuleSource(root, relativePath) {
  const directory = path.dirname(path.resolve(root, relativePath));
  const seen = new Set();
  function read(file) {
    if (seen.has(file)) return '';
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const localSources = parsed.statements.flatMap((statement) => {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
      const request = statement.moduleSpecifier?.text;
      if (!request?.startsWith('./')) return [];
      const target = path.resolve(path.dirname(file), request + '.ts');
      return path.dirname(target) === directory && fs.existsSync(target) ? [read(target)] : [];
    });
    return [source, ...localSources].join('\n');
  }
  return read(path.resolve(root, relativePath));
}

module.exports = { readModuleSource };
