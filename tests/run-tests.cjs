'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const full = process.argv[2] === 'full';
const career = process.argv[2] === 'career';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(file));
    else if (entry.isFile() && entry.name.endsWith('.test.cjs')) out.push(file);
  }
  return out;
}

const tests = walk(__dirname)
  .filter((file) =>
    (full || !file.includes(`${path.sep}full${path.sep}`)) &&
    (!career || path.basename(file).startsWith('career-'))
  )
  .sort();

let failed = 0;
for (const file of tests) {
  const label = path.relative(root, file).replaceAll('\\', '/');
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    ...(career ? { timeout: 60_000 } : {}),
  });

  if (result.status === 0) {
    console.log(`PASS ${label}`);
  } else {
    failed++;
    console.error(`FAIL ${label}`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
  }
}

console.log(
  `TEST GATE: ${failed ? 'FAILED' : 'PASSED'} · ${tests.length - failed} passed · ${failed} failed`
);
process.exitCode = failed ? 1 : 0;
