'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const { createShipOwnershipService } = load('src/systems/ships/ship-ownership-service.ts');
const { createShipLoadoutService } = load('src/systems/ships/ship-loadout-service.ts');
const { createShipComponentInventoryService } = load(
  'src/systems/ships/ship-component-inventory-service.ts'
);
const { createShipyardResearchService } = load('src/systems/ships/shipyard-research-service.ts');
const { createShipProgressionSnapshot, stageCareerShipProgression } = load(
  'src/systems/ships/ship-progression-snapshot.ts'
);

const ship = getAllShipDefinitions()[0];
assert(ship);
let charges = 0;
const wallet = {
  takeCredits(amount) {
    charges += amount;
    return true;
  },
};
const player = { cargo: {}, reservedCargoTons: 0 };
const owned = createShipOwnershipService(ship.id, wallet);
const loads = createShipLoadoutService();
loads.get(ship);
const inventory = createShipComponentInventoryService(player);
const part = inventory.store('mine', 'mine-ion-1', 'wreck-1', 200);
assert(part);
const research = createShipyardResearchService();
assert(research.registerComponent('weapon', 'special_performance_12_weapon1'));
const saved = createShipProgressionSnapshot(ship.id, owned, loads, inventory, research);
const before = charges;
const staged = stageCareerShipProgression(saved, ship.id, player, wallet);
assert.equal(staged.activeShipId, ship.id);
assert.equal(charges, before);
assert.equal(player.reservedCargoTons, part.cargoTons);
assert.deepEqual(
  createShipProgressionSnapshot(
    staged.activeShipId,
    staged.ownership,
    staged.loadouts,
    staged.inventory,
    staged.research
  ),
  saved
);
assert.throws(() =>
  stageCareerShipProgression({ ...saved, activeShipId: 'unknown' }, ship.id, player, wallet)
);
assert.equal(charges, before);
assert.deepEqual(owned.snapshot().ownedShipIds, [ship.id]);
assert.equal(inventory.list().length, 1);
console.log('PASS staged career ship progression and active hull validation');
