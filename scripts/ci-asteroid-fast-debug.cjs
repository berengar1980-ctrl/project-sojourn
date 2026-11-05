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
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('FAIL ' + file);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
