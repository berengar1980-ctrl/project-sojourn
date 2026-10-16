'use strict';

const fs = require('node:fs');
const prettier = require('prettier');

async function main() {
  const file = 'tests/ui/star-map-menu-behavior.test.cjs';
  const actual = fs.readFileSync(file, 'utf8');
  const config = JSON.parse(fs.readFileSync('.prettierrc.json', 'utf8'));
  const expected = await prettier.format(actual, { ...config, filepath: file });
  let line = 1;
  let a = 0;
  let b = 0;
  while (a < actual.length && b < expected.length && actual[a] === expected[b]) {
    if (actual[a] === '\n') line++;
    a++;
    b++;
  }
  const clip = (text) => text.slice(Math.max(0, a - 80), a + 180);
  const raw = 'LINE ' + line + ' EXPECTED: ' + JSON.stringify(clip(expected));
  const info = [
    'offset=' + a + ' oldLen=' + actual.length + ' newLen=' + expected.length,
    'old: ' + JSON.stringify(clip(actual)),
    'new: ' + JSON.stringify(clip(expected)),
  ];
  const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
  const owner = process.env.CIRCLE_PROJECT_USERNAME;
  const repo = process.env.CIRCLE_PROJECT_REPONAME;
  const sha = process.env.CIRCLE_SHA1;
  if (!token) throw new Error(raw);
  for (const [index, message] of info.entries()) {
    const response = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/statuses/' + sha, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'sojourn-ci' },
      body: JSON.stringify({
        state: 'failure',
        context: 'ci/temp-test-diff-' + index,
        description: message.slice(0, 140),
      }),
    });
    if (!response.ok) throw new Error('No diagnostic permission ' + response.status);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
