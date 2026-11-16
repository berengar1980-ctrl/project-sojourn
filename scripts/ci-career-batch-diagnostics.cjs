'use strict';

const { spawnSync } = require('node:child_process');

const checks = [
  ['Format write', 'npm', ['run', 'format']],
  ['Prettier verification', 'npm', ['run', 'format:check']],
  ['Lint', 'npm', ['run', 'lint']],
  ['TypeScript', 'npm', ['run', 'typecheck']],
  ['Dependency architecture', 'npm', ['run', 'deps:check']],
  ['Persistence impact', 'npm', ['run', 'persistence:check']],
  ['Regression tests', 'npm', ['run', 'test:quick']],
  ['Economy horizons', 'npm', ['run', 'test:economy-horizons']],
  ['Build', 'npm', ['run', 'build']],
];
const results = [];
for (const [name, command, args] of checks) {
  process.stdout.write('\n=== ' + name + ' ===\n');
  // The normal quality gate stops at the first failure. Run every remaining
  // command independently and publish diagnostics for all domains.
  const reportLabel = 'batch-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const result = spawnSync(
    'node',
    ['scripts/ci-run-and-report.cjs', reportLabel, '--', command, ...args],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    }
  );
  const output = [result.stdout ?? '', result.stderr ?? ''].join('\n');
  if (output.length > 24000) {
    process.stdout.write(output.slice(0, 10000) + '\n... output truncated ...\n');
    process.stdout.write(output.slice(-14000));
  } else {
    process.stdout.write(output);
  }
  results.push({ check: name, exitCode: result.status ?? -1 });
}
const diff = spawnSync('git', ['diff', '--', '.'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
process.stdout.write('\n=== Changes requested by Prettier (diagnostic checkout only) ===\n');
if (diff.stdout) process.stdout.write(diff.stdout.slice(0, 30000));
process.stdout.write('\n=== Combined quality result ===\n');
for (const result of results) {
  process.stdout.write(result.check + ': ' + (result.exitCode === 0 ? 'PASS' : 'FAIL') + '\n');
}
// This is the report stage of an already failed CI job, not a merge gate.
