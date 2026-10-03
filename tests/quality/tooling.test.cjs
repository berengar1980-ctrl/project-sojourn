'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

for (const script of [
  'test',
  'test:full',
  'lint',
  'format',
  'format:check',
  'deps:check',
  'check',
]) {
  assert.equal(typeof pkg.scripts?.[script], 'string', `missing package script: ${script}`);
}

assert.equal(pkg.type, 'module', 'runtime must use ES modules');
assert(Number(pkg.engines?.node?.match(/\d+/)?.[0] || 0) >= 20, 'Node 20+ is required');

for (const file of ['.editorconfig', '.prettierrc.json', 'eslint.config.mjs']) {
  assert(fs.existsSync(path.join(root, file)), `missing tooling file: ${file}`);
}

console.log('PASS tooling contract');
