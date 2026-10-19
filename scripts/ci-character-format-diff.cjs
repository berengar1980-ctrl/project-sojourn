'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { postStatus } = require('./ci-run-and-report.cjs');

const files = [
  'src/core/player-profile.ts',
  'src/systems/crew/crew-roster-service.ts',
  'src/ui/start/character-editor-skills.ts',
  'src/ui/start/character-editor.ts',
  'tests/ui/character-editor.test.cjs',
  'tests/crew/captain-station.test.cjs',
  'src/ui/start/character-editor.css',
];
async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sojourn-format-'));
  let index = 0;
  try {
    for (const file of files) {
      const prettier = spawnSync('npx', ['prettier', file], { encoding: 'utf8' });
      if (prettier.status !== 0) throw Error(prettier.stderr || file);
      const expected = path.join(folder, path.basename(file));
      fs.writeFileSync(expected, prettier.stdout);
      const diff = spawnSync('diff', ['-U0', file, expected], { encoding: 'utf8' });
      if (diff.status !== 0 && diff.status !== 1) throw Error(diff.stderr);
      const lines = diff.stdout.split(/\r?\n/).filter((line) => /^(?:@@|\+[^+]|-[^-])/.test(line));
      for (const line of lines.slice(0, 60)) {
        index++;
        await postStatus('failure', 'format-diff-' + String(index).padStart(3, '0'), file + ' ' + line);
      }
    }
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
