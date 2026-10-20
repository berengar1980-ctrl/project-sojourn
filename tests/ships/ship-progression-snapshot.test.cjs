'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const inventory = load('src/systems/ships/ship-component-inventory-service.ts');
const loadouts = load('src/systems/ships/ship-loadout-service.ts');
const research = load('src/systems/ships/shipyard-research-service.ts');
const snapshots = load('src/systems/ships/ship-progression-snapshot.ts');
const ownershipModule = load('src/systems/ships/ship-ownership-service.ts');

const registry = load('src/systems/ships/ship-registry.ts');
const ship = registry.getAllShipDefinitions()[0];
assert(ship, 'a ship fixture must exist for loadout invariants');

const player = { cargo: {}, reservedCargoTons: 0 };
const otherShip = registry.getAllShipDefinitions().find((entry) => entry.id !== ship.id);
assert(otherShip);
const owned = ownershipModule.createShipOwnershipService(ship.id, {
  takeCredits: () => true,
});
const bag = inventory.createShipComponentInventoryService(player);
const part = bag.store('mine', 'mine-ion-1', 'wreck-1', 200, 'salvage');
assert(part);
const loads = loadouts.createShipLoadoutService();
const found = research.createShipyardResearchService();
const installed = loads.get(ship);
const loadoutSnapshot = loads.snapshot();
assert(loadoutSnapshot[ship.id], 'loadout snapshot must include initialized ships');
const firstType = Object.keys(installed)[0];
assert(firstType, 'fixture must have a component slot');
const firstId = loadoutSnapshot[ship.id][firstType][0];
loadoutSnapshot[ship.id][firstType][0] = 'tampered-component';
assert.equal(loads.get(ship)[firstType][0], firstId, 'snapshot arrays must be detached');
assert.equal(loads.setSlot(ship, 'mine', 1, 'mine-ion-1'), false);
assert.equal(loads.get(ship).mine[0], '', 'invalid slot index must not mutate loadout');

assert(found.registerComponent('weapon', 'special_performance_12_weapon1'));
const initial = snapshots.createShipProgressionSnapshot(ship.id, owned, loads, bag, found);

assert.equal(initial.inventory.components.length, 1);
assert.deepEqual(initial.ownedShipIds, [ship.id]);
assert.equal(initial.discoveredBonuses['weapon:weapon1'].performance, 12);
assert.doesNotThrow(() => JSON.stringify(initial), 'snapshot must contain plain JSON data');

assert.equal(owned.purchase(otherShip.id), ownershipModule.shipPurchasePrice(otherShip));
bag.take(part.uid);
found.registerComponent('weapon', 'special_performance_20_weapon1');
assert.equal(initial.inventory.components.length, 1, 'snapshot is not a live inventory reference');
assert.deepEqual(initial.ownedShipIds, ['miner', 'patrol']);
assert.equal(initial.discoveredBonuses['weapon:weapon1'].performance, 12);

// A snapshot must be an observation, never a mutable handle into the owning services.
initial.inventory.components[0].name = 'tampered';
initial.inventory.components.push({ ...initial.inventory.components[0], uid: 'fake' });
initial.ownedShipIds.push('fake');
initial.discoveredBonuses['weapon:weapon1'].performance = 99;
const current = snapshots.createShipProgressionSnapshot(ship.id, owned, loads, bag, found);
assert.equal(current.inventory.components.length, 0, 'mutating snapshot must not create cargo');
assert.deepEqual(current.ownedShipIds, [ship.id, otherShip.id].sort());
assert(!current.ownedShipIds.includes('fake'), 'snapshot mutation must not change ship ownership');
assert.equal(current.discoveredBonuses['weapon:weapon1'].performance, 20);
assert.equal(
  current.inventory.serial,
  1,
  'removed inventory entries must preserve the UID counter'
);

const rejected = bag.store('mine', 'mine-ion-1', 'wreck-2', 0, 'salvage');
assert.equal(rejected, null, 'failed storage must not add inventory');
assert.equal(player.reservedCargoTons, 0, 'failed storage must not reserve cargo');
assert.equal(bag.snapshot().serial, 1, 'failed storage must not consume a new UID');

console.log('PASS detached, serializable ship progression snapshots');
