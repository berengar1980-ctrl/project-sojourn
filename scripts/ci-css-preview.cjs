'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { postStatus } = require('./ci-run-and-report.cjs');

async function run() {
  const file = 'src/ui/start/character-editor.css';
  const output = spawnSync('npx', ['prettier', file], { encoding: 'utf8' });
  if (output.status !== 0) throw new Error(output.stderr || 'Prettier failed');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sojourn-css-'));
  const formattedFile = path.join(directory, 'expected.css');
  fs.writeFileSync(formattedFile, output.stdout);
  const diff = spawnSync('diff', ['-u', file, formattedFile], { encoding: 'utf8' });
  if (diff.status !== 1 && diff.status !== 0) throw new Error(diff.stderr || 'Diff failed');
  const lines = diff.stdout.split(/\r?\n/).filter(Boolean).slice(2);
  for (let index = 0; index < Math.min(12, lines.length); index += 1) {
    await postStatus('failure', 'css-preview-' + (index + 1), lines[index]);
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
