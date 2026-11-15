'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const { createShipOwnershipService, stageCareerShipOwnership, shipPurchasePrice } = load(
  'src/systems/ships/ship-ownership-service.ts'
);

const [starter, second] = getAllShipDefinitions();
assert(starter && second && starter.id !== second.id);
let debits = 0;
const wallet = {
  takeCredits(amount) {
    debits += amount;
    return true;
  },
};
const original = createShipOwnershipService(starter.id, wallet);
assert.equal(original.purchase(second.id), shipPurchasePrice(second));
const snapshot = original.snapshot();
const chargedBeforeRestore = debits;
const restored = stageCareerShipOwnership(snapshot, starter.id, wallet);
assert.equal(debits, chargedBeforeRestore, 'restore must never charge for previously owned hulls');
assert.deepEqual(restored.snapshot(), snapshot);
assert.equal(restored.purchase(second.id), null, 'restored hull must not be bought twice');
assert.equal(debits, chargedBeforeRestore);
assert.equal(restored.owns(second.id), true);

for (const invalid of [
  { ownedShipIds: [] },
  { ownedShipIds: [starter.id, starter.id] },
  { ownedShipIds: [second.id] },
  { ownedShipIds: [starter.id, 'nonexistent-ship'] },
  { ownedShipIds: [starter.id, 5] },
]) {
  assert.throws(() => stageCareerShipOwnership(invalid, starter.id, wallet));
  assert.equal(debits, chargedBeforeRestore, 'invalid restore must not debit credits');
}
assert.deepEqual(original.snapshot(), snapshot, 'restore must not mutate live ownership');
console.log('PASS career ship ownership checkpoint: detached restore and no duplicate purchase');
