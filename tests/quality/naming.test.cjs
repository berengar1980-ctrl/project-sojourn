'use strict';

const assert = require('assert/strict');
const path = require('path');
const { runtimeFiles } = require('../../scripts/source-files.cjs');

const root = path.resolve(__dirname, '../..');
const invalid = runtimeFiles(root)
  .map((file) => path.relative(root, file).replaceAll('\\', '/'))
  .filter((file) => !/^[a-z0-9/-]+\.ts$/.test(file));

assert.deepEqual(
  invalid,
  [],
  `runtime filenames must use lowercase kebab-case TypeScript names:\n${invalid.join('\n')}`
);
console.log('PASS runtime TypeScript naming convention');
