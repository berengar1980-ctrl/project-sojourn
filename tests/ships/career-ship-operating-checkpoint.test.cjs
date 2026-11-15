'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const { createShipOperatingService, stageCareerShipOperating } = load(
  'src/systems/ships/ship-operating-costs.ts'
);
const ship = getAllShipDefinitions()[0];
assert(ship);
let debits = 0;
const wallet = { player: { credits: 100000 }, takeCredits: (amount) => { debits += amount; return true; } };
const live = createShipOperatingService(wallet);
const initial = live.snapshot(ship, 100);
live.burn(ship, 100);
live.recordHull(ship, 72, 100);
const checkpoint = live.snapshotAll().hulls;
const restored = stageCareerShipOperating(checkpoint, wallet, [ship.id]);
assert.deepEqual(restored.snapshotAll().hulls, checkpoint);
assert.equal(restored.snapshot(ship, 100).hullHp, 72);
assert.equal(debits, 0, 'restoring hull state must not debit credits');
restored.recordHull(ship, 50, 100);
assert.equal(live.snapshot(ship, 100).hullHp, 72, 'restored state must be independent');
assert.equal(initial.hullHp, 100);
for (const invalid of [
  [{ ...checkpoint[0], fuel: -1 }],
  [{ ...checkpoint[0], fuel: Infinity }],
  [{ ...checkpoint[0], damage: -1 }],
  [{ ...checkpoint[0], damage: NaN }],
  [{ ...checkpoint[0], shipId: 'unknown' }],
  [checkpoint[0], checkpoint[0]],
]) {
  assert.throws(() => stageCareerShipOperating(invalid, wallet, [ship.id]));
  assert.equal(debits, 0);
}
console.log('PASS career ship operating checkpoint: fuel, hull, isolation and no charges');
