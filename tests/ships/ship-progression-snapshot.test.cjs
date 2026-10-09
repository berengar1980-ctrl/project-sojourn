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

const player = { cargo: {}, reservedCargoTons: 0 };
const owned = new Set(['miner', 'patrol']);
const bag = inventory.createShipComponentInventoryService(player);
const part = bag.store('mine', 'mine-ion-1', 'wreck-1', 200, 'salvage');
assert(part);
const loads = loadouts.createShipLoadoutService();
const found = research.createShipyardResearchService();
assert(found.registerComponent('weapon', 'special_performance_12_weapon1'));
const initial = snapshots.createShipProgressionSnapshot('miner', owned, loads, bag, found);

assert.equal(initial.inventory.components.length, 1);
assert.deepEqual(initial.ownedShipIds, ['miner', 'patrol']);
assert.equal(initial.discoveredBonuses['weapon:weapon1'].performance, 12);
assert.doesNotThrow(() => JSON.stringify(initial), 'snapshot must contain plain JSON data');

owned.add('salvage');
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
const current = snapshots.createShipProgressionSnapshot('miner', owned, loads, bag, found);
assert.equal(current.inventory.components.length, 0, 'mutating snapshot must not create cargo');
assert(!current.ownedShipIds.includes('fake'), 'snapshot mutation must not change ship ownership');
assert.equal(current.discoveredBonuses['weapon:weapon1'].performance, 20);
assert.equal(current.inventory.serial, 1, 'removed inventory entries must preserve the UID counter');

const rejected = bag.store('mine', 'mine-ion-1', 'wreck-2', 0, 'salvage');
assert.equal(rejected, null, 'failed storage must not add inventory');
assert.equal(player.reservedCargoTons, 0, 'failed storage must not reserve cargo');
assert.equal(bag.snapshot().serial, 1, 'failed storage must not consume a new UID');

console.log('PASS detached, serializable ship progression snapshots');
