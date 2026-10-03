'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('acorn');
const { runtimeFiles } = require('../../scripts/source-files.cjs');

const root = path.resolve(__dirname, '../..');
const files = runtimeFiles(root);
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const forbidden = [];
const oversized = [];
const nonModules = [];

assert(files.length > 0, 'runtime contains no modules');

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const name = rel(file);
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    nonModules.push(`${name}: ${error.message}`);
    continue;
  }
  if (/\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(/.test(source)) {
    forbidden.push(`${name}: dynamic code/document.write`);
  }
  if (/\b(?:window|globalThis)(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)\s*=/.test(source)) {
    forbidden.push(`${name}: writable global export`);
  }
  if (source.split('\n').length > 500) oversized.push(`${name}: more than 500 lines`);
  if (!ast.body.some((node) => node.type.startsWith('Import') || node.type.startsWith('Export'))) {
    nonModules.push(`${name}: no import/export declaration`);
  }
}

assert.deepEqual(nonModules, [], `all runtime files must be ES modules:\n${nonModules.join('\n')}`);
assert.deepEqual(forbidden, [], `forbidden architecture patterns:\n${forbidden.join('\n')}`);
assert.deepEqual(oversized, [], `split oversized modules:\n${oversized.join('\n')}`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtimeScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)];
assert.equal(runtimeScripts.length, 1, 'index.html must have one runtime entry point');
assert.match(runtimeScripts[0][0], /type="module"/);
assert.equal(runtimeScripts[0][1], './src/main.js');

console.log(`PASS architecture contract: ${files.length} ES modules`);
