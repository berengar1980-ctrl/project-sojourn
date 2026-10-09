'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const owners = [
  'src/systems/ships/ship-loadout-service.ts',
  'src/systems/ships/ship-component-inventory-service.ts',
  'src/systems/ships/shipyard-research-service.ts',
];
for (const file of owners) {
  const text = source(file);
  assert.match(text, /snapshot\(\)/, file + ' must expose a state snapshot');
  assert.doesNotMatch(
    text,
    /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/,
    file + ' must not implement storage or browser persistence'
  );
}
const boundary = source('src/systems/ships/ship-progression-snapshot.ts');
for (const key of ['activeShipId', 'ownedShipIds', 'loadouts', 'inventory', 'discoveredBonuses']) {
  assert.match(boundary, new RegExp('\\b' + key + '\\b'), 'missing snapshot field ' + key);
}
assert.doesNotMatch(
  boundary,
  /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/,
  'snapshot boundary must remain storage agnostic'
);
const portUi = source('src/ui/port/port-panel.ts');
assert.doesNotMatch(
  portUi,
  /\b(ownedShipIds|byShipId|reservedCargoTons|discovered\.set)\b/,
  'port UI must use callbacks instead of mutating domain-owned state'
);
const agentRules = source('AGENTS.md');
assert.match(agentRules, /Mutable game state and future persistence/);
assert.match(agentRules, /behavioral.*regression tests/i);
console.log('PASS domain state owners, storage-free snapshots, and UI architecture boundaries');
