'use strict';

// Temporary CI-only diagnostic: publish a short Prettier diff through commit
// statuses so the exact formatting mismatch can be corrected and this file removed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const prettier = require('prettier');

async function main() {
  const file = 'src/ui/map/star-map-menu.ts';
  const actual = fs.readFileSync(file, 'utf8');
  const config = JSON.parse(fs.readFileSync('.prettierrc.json', 'utf8'));
  const expected = await prettier.format(actual, { ...config, filepath: file });
  if (actual === expected) return;

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sojourn-prettier-'));
  const left = path.join(temp, 'actual.ts');
  const right = path.join(temp, 'expected.ts');
  fs.writeFileSync(left, actual);
  fs.writeFileSync(right, expected);
  const diff = spawnSync('diff', ['-u', left, right], { encoding: 'utf8' });
  const lines = (diff.stdout || '').split('\n').filter((line) => line.startsWith('+') || line.startsWith('-') || line.startsWith('@@'));
  fs.rmSync(temp, { recursive: true, force: true });

  const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
  const owner = process.env.CIRCLE_PROJECT_USERNAME;
  const repo = process.env.CIRCLE_PROJECT_REPONAME;
  const sha = process.env.CIRCLE_SHA1;
  if (!token || !owner || !repo || !sha) return;
  for (const [index, line] of lines.slice(0, 28).entries()) {
    const response = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/statuses/' + sha, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'project-sojourn-ci-format-diagnostic',
      },
      body: JSON.stringify({
        state: 'failure',
        context: 'ci/temp-format-diff-' + String(index + 1).padStart(2, '0'),
        description: line.slice(0, 140),
        target_url: process.env.CIRCLE_BUILD_URL,
      }),
    });
    if (!response.ok) throw new Error('Status diagnostic unavailable: ' + response.status);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
