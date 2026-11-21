'use strict';

/**
 * Baseline from main at the start of FleetCombat development.
 * Git object hashes compare the entire file byte-for-byte, not just symbols.
 * Intentional 1vs1 changes require an explicit baseline-review decision.
 */
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const protectedFiles = {
  'src/systems/combat/strategic-combat-service.ts': '927a4e91bab05ecd773e364214dbf197d7d5523f',
  'src/systems/combat/strategic-combat-movement.ts': '9e41a73bfacbfc7ef27ea0da6e2d877e29869cd6',
  'src/systems/combat/strategic-combat-mines.ts': '42052ed2179562623e263547c156a35b7bcda78a',
  'src/systems/combat/strategic-combat-weapons.ts': 'edbff1ce4cdb8e52f48abad8a1f10e3c1f7245ca',
  'src/systems/combat/strategic-combat-runtime.ts': '512197fe151cca977e88389edad415c722b251bd',
  'src/systems/combat/strategic-combat-geometry.ts': 'f8a1e80c332bcc593989c8e8ba34d79263e44d9d',
  'src/ui/start/duel-lobby.ts': 'f9c0699be85b9bf9dae2fb0e9d8b95b092fb758b',
  'src/ui/combat/strategic-combat-panel.ts': 'd6f7959afc2b1b627657c99f3cf950d2da77afd7',
};
for (const [file, expected] of Object.entries(protectedFiles)) {
  const data = fs.readFileSync(path.join(root, file));
  const hash = nodeCrypto
    .createHash('sha1')
    .update('blob ' + data.length + '\0')
    .update(data)
    .digest('hex');
  assert.equal(hash, expected, '1vs1 BASELINE CHANGED: ' + file);
}
console.log('PASS protected 1vs1 source files match original main byte-for-byte');
