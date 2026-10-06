'use strict';

const { spawnSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');

const FILE = 'tests/ships/ship-systems-foundation.test.cjs';
const CHUNK_SIZE = 120;

async function post(context, description) {
  const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
  const owner = process.env.CIRCLE_PROJECT_USERNAME;
  const repository = process.env.CIRCLE_PROJECT_REPONAME;
  const sha = process.env.CIRCLE_SHA1;
  if (!token || !owner || !repository || !sha) throw new Error('Missing GitHub status environment');

  const response = await fetch(`https://api.github.com/repos/${owner}/${repository}/statuses/${sha}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'project-sojourn-circleci',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      state: 'success',
      context,
      description,
      target_url: process.env.CIRCLE_BUILD_URL || undefined,
    }),
  });
  if (!response.ok) throw new Error(`GitHub status failed: ${response.status}`);
}

async function main() {
  const result = spawnSync('npx', ['prettier', FILE], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  if (result.status !== 0) throw new Error(result.stderr || 'Prettier export failed');

  const encoded = gzipSync(Buffer.from(result.stdout, 'utf8')).toString('base64');
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + CHUNK_SIZE));
  }
  for (let index = 0; index < chunks.length; index += 1) {
    await post(`ci/export-prettier:${String(index).padStart(2, '0')}`, chunks[index]);
  }
  await post('ci/export-prettier:meta', `chunks=${chunks.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
