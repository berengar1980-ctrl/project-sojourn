'use strict';

// Temporary CI formatter diff probe; removed after resolving formatting.
const { execFileSync } = require('node:child_process');
const files = [
  'src/ui/local-space/asteroid-backdrop-renderer.ts',
  'tests/local-space/asteroid-backdrop.test.cjs',
];
execFileSync(process.execPath, ['node_modules/prettier/bin/prettier.cjs', '--write', ...files], {
  stdio: 'pipe',
});
const diff = execFileSync('git', ['diff', '--unified=0', '--', ...files], {
  encoding: 'utf8',
});
const lines = diff.split('\n');
let filename = '';
let hunk = '';
let oldLines = [];
let newLines = [];
function flush() {
  if (!oldLines.length && !newLines.length) return;
  console.log('error ' + filename + ' ' + hunk + ' old=' + oldLines.join(' ') + ' new=' + newLines.join(' '));
  oldLines = [];
  newLines = [];
}
for (const line of lines) {
  if (line.startsWith('+++ b/')) {
    flush();
    filename = line.slice(6);
  } else if (line.startsWith('@@')) {
    flush();
    hunk = line.split(' @@')[0];
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    oldLines.push(line.slice(1));
  } else if (line.startsWith('+') && !line.startsWith('+++')) {
    newLines.push(line.slice(1));
  }
}
flush();
if (diff.trim()) process.exitCode = 1;
