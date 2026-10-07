'use strict';

const { spawnSync } = require('node:child_process');

const tests = [
  'tests/combat/spatial-combat.test.cjs',
  'tests/combat/local-space-attack-ui.test.cjs',
  'tests/combat/star-map-engagement.test.cjs',
  'tests/navigation/star-map-attack-ui.test.cjs',
  'tests/combat/ship-weapons-mines.test.cjs',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [test], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
