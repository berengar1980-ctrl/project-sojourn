'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { runtimeFiles } = require('../../scripts/source-files.cjs');

const root = path.resolve(__dirname, '../..');
const files = runtimeFiles(root);
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const forbidden = [];
const oversized = [];
const parseFailures = [];

assert(files.length > 0, 'runtime contains no TypeScript modules');

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const name = rel(file);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  if (sourceFile.parseDiagnostics.length) {
    parseFailures.push(
      `${name}: ${sourceFile.parseDiagnostics.map((diag) => String(diag.messageText)).join('; ')}`
    );
  }

  if (/\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(/.test(source)) {
    forbidden.push(`${name}: dynamic code/document.write`);
  }
  if (/\b(?:window|globalThis)(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)\s*=/.test(source)) {
    forbidden.push(`${name}: writable global export`);
  }
  if (source.split('\n').length > 500) oversized.push(`${name}: more than 500 lines`);
  if (!/\b(?:import|export)\b/.test(source)) {
    parseFailures.push(`${name}: no ES module import/export declaration`);
  }
}

assert.deepEqual(
  parseFailures,
  [],
  `all runtime files must be valid TypeScript ES modules:\n${parseFailures.join('\n')}`
);
assert.deepEqual(forbidden, [], `forbidden architecture patterns:\n${forbidden.join('\n')}`);
assert.deepEqual(oversized, [], `split oversized modules:\n${oversized.join('\n')}`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtimeScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)];
assert.equal(runtimeScripts.length, 1, 'index.html must have one runtime entry point');
assert.match(runtimeScripts[0][0], /type="module"/);
assert.equal(runtimeScripts[0][1], '/src/main.ts');

console.log(`PASS architecture contract: ${files.length} TypeScript ES modules`);
