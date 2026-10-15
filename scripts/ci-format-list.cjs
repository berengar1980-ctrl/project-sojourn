'use strict';

const { spawnSync } = require('node:child_process');

async function main() {
  const result = spawnSync('npx', ['prettier', '--list-different', '.'], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const files = result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
  const owner = process.env.CIRCLE_PROJECT_USERNAME;
  const repo = process.env.CIRCLE_PROJECT_REPONAME;
  const sha = process.env.CIRCLE_SHA1;
  if (!token || !owner || !repo || !sha) throw new Error('CI status token unavailable');
  const targets = files.length ? files : ['No file reported; exit=' + result.status];
  for (const [index, file] of targets.slice(0, 15).entries()) {
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
        context: 'ci/temp-unformatted-' + String(index + 1).padStart(2, '0'),
        description: file.slice(0, 140),
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
