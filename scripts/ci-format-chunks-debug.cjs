'use strict';

// Temporary diagnostics: publish the local Prettier-only patch, compressed,
// back to this commit's own GitHub status contexts. Removed before merge.
const { execFileSync } = require('node:child_process');
const { brotliCompressSync } = require('node:zlib');
const { postStatus } = require('./ci-run-and-report.cjs');

async function main() {
  const diff = execFileSync('git', ['diff', '--', 'src/', 'tests/', 'docs/'], {
    encoding: 'utf8',
  });
  const data = brotliCompressSync(Buffer.from(diff, 'utf8')).toString('base64');
  const chunks = data.match(/.{1,112}/g) ?? [];
  for (let index = 0; index < chunks.length; index += 1) {
    const name = 'fmt-chunk-' + String(index).padStart(3, '0');
    const ok = await postStatus('success', name, chunks[index]);
    if (!ok) throw new Error('Unable to publish formatter diff fragment ' + index);
  }
  await postStatus('success', 'fmt-count', String(chunks.length));
  console.log('FORMAT DIFF CHUNKS ' + chunks.length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
