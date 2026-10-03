'use strict';

const assert = require('assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const result = spawnSync(process.execPath, ['scripts/dependency-report.cjs', '--check'], {
  cwd: root,
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr || result.stdout);
console.log(result.stdout.trim());
