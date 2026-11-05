'use strict';

// Temporary focused diagnosis; the full npm test suite is restored before merge.
const { spawnSync } = require('node:child_process');
const files = [
  'tests/local-space/visual-contact-radius.test.cjs',
  'tests/combat/combat-visible-collider.test.cjs',
  'tests/local-space/compound-asteroid-contact.test.cjs',
  'tests/combat/combat-asteroid-shield-contact.test.cjs',
  'tests/combat/combat-asteroid-motion.test.cjs',
  'tests/combat/combat-asteroid-impact-balance.test.cjs',
  'tests/combat/combat-dense-asteroid-interception.test.cjs',
  'tests/combat/duel-arena-presets.test.cjs',
  'tests/local-space/ship-obstacle-collision.test.cjs',
  'tests/local-space/local-space.test.cjs',
];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr + '\\n' + result.stdout)
      .split(/\\r?\\n/)
      .find((line) => line.includes('AssertionError') || line.startsWith('Error:'));
    console.error('FAIL ' + file + (detail ? ' · ' + detail.trim() : ''));
    failed = true;
  } else {
    process.stdout.write('PASS ' + file + '\\n');
  }
}
if (failed) process.exitCode = 1;
