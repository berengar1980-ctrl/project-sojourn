'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const files = process.argv.slice(2);

for (const file of files) {
  const result = spawnSync('npx', ['prettier', file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'Prettier failed.\n');
    process.exit(1);
  }

  const before = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const after = result.stdout.split(/\r?\n/);
  const length = Math.max(before.length, after.length);

  for (let index = 0; index < length; index += 1) {
    if (before[index] === after[index]) continue;
    const oldLine = JSON.stringify(before[index] ?? '');
    const newLine = JSON.stringify(after[index] ?? '');
    console.error(`Error: ${file} L${index + 1}: ${oldLine} => ${newLine}`);
    process.exit(1);
  }
}

console.log('Selected files already match Prettier.');
