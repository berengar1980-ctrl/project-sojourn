'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const file = 'scripts/check-feature-parity.cjs';
const original = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const result = spawnSync('npx', ['prettier', file], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'prettier probe failed');
  process.exit(result.status ?? 1);
}

const formatted = result.stdout.replaceAll('\r\n', '\n');
if (formatted === original) {
  console.log('probe: formatted');
  process.exit(0);
}

const before = original.split('\n');
const after = formatted.split('\n');
const count = Math.max(before.length, after.length);
for (let index = 0; index < count; index += 1) {
  if (before[index] === after[index]) continue;
  const line = index + 1;
  const current = JSON.stringify(before[index] ?? '<missing>');
  const expected = JSON.stringify(after[index] ?? '<missing>');
  console.error('Error: PRETTIER line ' + line + ' current=' + current + ' expected=' + expected);
  process.exit(1);
}

process.exit(1);
