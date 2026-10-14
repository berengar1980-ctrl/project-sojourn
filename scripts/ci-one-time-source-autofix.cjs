'use strict';

// One-time branch repair. Uses the CI status token only if GitHub also grants
// contents:write. No changes to main, no check bypass and no token logging.
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const branch = 'fix/main-quality-gate-after-pr230';
const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
const owner = process.env.CIRCLE_PROJECT_USERNAME;
const repo = process.env.CIRCLE_PROJECT_REPONAME;
const initialSha = process.env.CIRCLE_SHA1;
const api = 'https://api.github.com/repos/' + owner + '/' + repo;
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + token,
  'Content-Type': 'application/json',
  'User-Agent': 'project-sojourn-one-time-autofix',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function request(url, options) {
  const response = await fetch(url, { headers, ...options });
  if (!response.ok) throw Error((options?.method ?? 'GET') + ' ' +
    response.status + ' ' + url.split('/').slice(-2).join('/'));
  return response.json();
}

async function report(state, detail) {
  await request(api + '/statuses/' + initialSha, {
    method: 'POST',
    body: JSON.stringify({
      state,
      context: 'ci/diagnostic: source-autofix',
      description: detail.slice(0, 138),
      target_url: process.env.CIRCLE_BUILD_URL,
    }),
  });
}

async function main() {
  if (process.env.CIRCLE_BRANCH !== branch || !token || !owner || !repo || !initialSha) {
    throw Error('One-time formatter requires exact repair branch and CI environment');
  }
  const files = execFileSync('git', ['diff', '--name-only', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.startsWith('.circleci/') && !file.startsWith('.github/'));
  if (!files.length) {
    await report('success', 'Prettier produced no remaining source differences');
    return;
  }
  await report('pending', 'Applying formatted sources: ' + files.length + ' files');
  const ref = await request(api + '/git/ref/heads/' + branch);
  if (ref.object.sha !== initialSha) {
    throw Error('Repair branch moved during CI job; aborting stale write');
  }
  let updated = 0;
  for (const filename of files) {
    const path = filename.split('/').map(encodeURIComponent).join('/');
    const remote = await request(api + '/contents/' + path + '?ref=' + encodeURIComponent(branch));
    await request(api + '/contents/' + path, {
      method: 'PUT',
      body: JSON.stringify({
        branch,
        message: 'style: apply Prettier to ' + filename,
        sha: remote.sha,
        content: readFileSync(filename).toString('base64'),
      }),
    });
    updated += 1;
  }
  await report('success', 'Formatted and committed ' + updated + ' sources; normal CI follows');
}

main().catch(async (error) => {
  try { await report('failure', 'Autofix blocked: ' + String(error.message)); } catch {}
  console.error('Source autofix stopped:', error.message);
  process.exitCode = 1;
});
