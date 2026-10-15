'use strict';
const { spawnSync } = require('node:child_process');
const { deflateRawSync } = require('node:zlib');
const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
const owner = process.env.CIRCLE_PROJECT_USERNAME;
const repository = process.env.CIRCLE_PROJECT_REPONAME;
const sha = process.env.CIRCLE_SHA1;
const branch = 'fix/main-quality-gate-after-pr230';
const url = 'https://api.github.com/repos/' + owner + '/' + repository + '/statuses/' + sha;
async function post(context, description, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': 'project-sojourn-ci-diagnostic',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      state: 'success',
      context,
      description,
      target_url: data
        ? 'https://github.com/' + owner + '/' + repository + '/commit/' + sha + '#lint=' + data
        : process.env.CIRCLE_BUILD_URL,
    }),
  });
  if (!response.ok) throw Error('Diagnostic publication HTTP ' + response.status);
}
async function run() {
  if (process.env.CIRCLE_BRANCH !== branch || !token) throw Error('Unexpected environment');
  const child = spawnSync('npm', ['run', 'lint'], { encoding: 'utf8', maxBuffer: 1000000 });
  const log = (child.stdout || '') + '\n' + (child.stderr || '');
  process.stdout.write(log);
  const zip = deflateRawSync(Buffer.from(log), { level: 9 })
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  const size = 1300,
    count = Math.ceil(zip.length / size);
  if (count > 95) throw Error('Diagnostic too large: ' + count);
  for (let i = 0; i < count; i += 1)
    await post(
      'ci/lint-report/' + String(i).padStart(3, '0'),
      'Lint report fragment ' + (i + 1) + '/' + count,
      zip.slice(i * size, (i + 1) * size)
    );
  await post(
    'ci/lint-report/complete',
    'count=' + count + ', bytes=' + Buffer.byteLength(log) + ', code=' + child.status
  );
  process.exitCode = child.status ?? 1;
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
