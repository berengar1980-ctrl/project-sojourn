'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { postStatus } = require('./ci-run-and-report.cjs');

async function run() {
  const file = 'src/ui/start/character-editor.css';
  const formatted = spawnSync('npx', ['prettier', file], { encoding: 'utf8' });
  if (formatted.status !== 0) throw Error(formatted.stderr || 'Formatter failed');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sojourn-css-'));
  const expected = path.join(directory, 'expected.css');
  fs.writeFileSync(expected, formatted.stdout);
  const result = spawnSync('diff', ['-U0', file, expected], { encoding: 'utf8' });
  if (![0, 1].includes(result.status)) throw Error(result.stderr || 'Diff failed');
  const lines = result.stdout
    .split(/\r?\n/)
    .filter((line) => /^(?:@@|\+[^+]|-[^-])/.test(line));
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    await postStatus('failure', 'css-format-diff-' + String(i + 1).padStart(2, '0'), lines[i]);
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
