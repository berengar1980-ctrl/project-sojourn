'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { fieldCombat, hasFieldCombat } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/star-map-engagement-fleet-resolution.ts'
);

let snapshots = 0;
const snapshot = { arena: { backdropSeed: 42 } };
const combat = {
  getArena: () => snapshot.arena,
  getSnapshot: () => {
    snapshots++;
    return snapshot;
  },
};
const fleet = { fieldLocationId: 'salvage-a', combat };
const runtime = {
  playerFleet: null,
  playerCombat: null,
  backgroundCombats: new Map(),
};
assert.equal(hasFieldCombat(runtime, 'salvage-a', 42), false);
runtime.backgroundCombats.set('pair', { fleet, combat });
assert.equal(hasFieldCombat(runtime, 'salvage-a', 42), true);
assert.equal(hasFieldCombat(runtime, 'salvage-a', 43), false);
assert.equal(hasFieldCombat(runtime, 'salvage-b', 42), false);
assert.equal(snapshots, 0);
assert.equal(fieldCombat(runtime, 'salvage-a', 42), snapshot);
assert.equal(snapshots, 1);
runtime.backgroundCombats.clear();
assert.equal(hasFieldCombat(runtime, 'salvage-a', 42), false);
runtime.playerFleet = fleet;
runtime.playerCombat = combat;
assert.equal(hasFieldCombat(runtime, 'salvage-a', 42), true);
assert.equal(hasFieldCombat(runtime, 'salvage-a', 43), false);
assert.equal(snapshots, 1);
runtime.playerFleet = null;
runtime.playerCombat = null;
assert.equal(hasFieldCombat(runtime, 'salvage-a', 42), false);
console.log('PASS live field ownership checks do not allocate combat snapshots');
