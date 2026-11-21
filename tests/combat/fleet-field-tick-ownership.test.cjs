'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (filename) => loadStandaloneTypeScriptModule(root, filename);
const { createFleetFieldTickOwnership } = load('src/systems/combat/fleet-field-tick-ownership.ts');

const firstField = { locationId: 'field-a' };
const secondField = { locationId: 'field-b' };
const owners = createFleetFieldTickOwnership();
const deltas = [];
const fleet = {
  tick(dt) {
    deltas.push(dt);
  },
};
const wrongFleet = { tick() {} };
let nativeTicks = 0;
function fieldStep(field, dt) {
  if (owners.tickIfOwned(field, dt)) return;
  nativeTicks++;
}
fieldStep(firstField, 0.08);
assert.equal(nativeTicks, 1, 'native career step remains active without a lease');
assert.equal(owners.hasActiveFleet(), false);
owners.acquire(firstField, fleet);
assert.equal(owners.hasActiveFleet(), true);
assert.equal(owners.owns(firstField), true);
assert.throws(() => owners.acquire(firstField, wrongFleet), /already owned/);
fieldStep(firstField, 0.08);
fieldStep(secondField, 0.08);
assert.deepEqual(deltas, [0.08], 'leased field advances the shared fleet exactly once');
assert.equal(nativeTicks, 2, 'other campaign fields continue running normally');
assert.throws(() => owners.release(firstField, wrongFleet), /ownership mismatch/);
assert.equal(owners.owns(firstField), true);
assert.throws(() => owners.tickIfOwned(firstField, NaN), /Invalid FleetCombat field delta/);
owners.release(firstField, fleet);
assert.equal(owners.hasActiveFleet(), false);
fieldStep(firstField, 0.08);
assert.equal(nativeTicks, 3, 'releasing the lease restores native career ticks');
assert.equal(owners.owns(firstField), false);
assert.throws(() => owners.release(firstField, fleet), /ownership mismatch/);

const reentrant = createFleetFieldTickOwnership();
const nested = {
  tick() {
    assert.throws(
      () => reentrant.tickIfOwned(firstField, 0.08),
      /Reentrant FleetCombat field tick/
    );
    assert.throws(
      () => reentrant.release(firstField, nested),
      /Cannot release FleetCombat field during tick/
    );
  },
};
reentrant.acquire(firstField, nested);
assert.equal(reentrant.tickIfOwned(firstField, 0.08), true);
reentrant.release(firstField, nested);
console.log('PASS exclusive career field tick transfer, isolation, and return');
