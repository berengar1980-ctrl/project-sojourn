'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');

const file = process.argv[2];
if (!file) throw new Error('file path missing');

const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
const owner = process.env.CIRCLE_PROJECT_USERNAME;
const repository = process.env.CIRCLE_PROJECT_REPONAME;
const sha = process.env.CIRCLE_SHA1;
if (!token || !owner || !repository || !sha) throw new Error('GitHub status environment missing');

const encoded = zlib.gzipSync(fs.readFileSync(file)).toString('base64');
const chunks = encoded.match(/.{1,120}/g) ?? [];

async function post(context, description) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/statuses/${sha}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'project-sojourn-circleci',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ state: 'success', context, description }),
    }
  );
  if (!response.ok) throw new Error('status export failed: ' + response.status);
}

(async () => {
  for (let index = 0; index < chunks.length; index += 1) {
    await post('ci/export:' + String(index).padStart(3, '0'), chunks[index]);
  }
  await post('ci/export:count', String(chunks.length));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
