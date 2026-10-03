'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

for (const script of [
  'dev',
  'build',
  'typecheck',
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

for (const file of ['.editorconfig', '.prettierrc.json', 'eslint.config.mjs', 'tsconfig.json']) {
  assert(fs.existsSync(path.join(root, file)), `missing tooling file: ${file}`);
}

assert.equal(typeof pkg.devDependencies?.typescript, 'string', 'TypeScript dependency missing');
assert.equal(typeof pkg.devDependencies?.vite, 'string', 'Vite dependency missing');
assert.equal(
  typeof pkg.devDependencies?.['typescript-eslint'],
  'string',
  'TypeScript ESLint dependency missing'
);

console.log('PASS TypeScript tooling contract');
