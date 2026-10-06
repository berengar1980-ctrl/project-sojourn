'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const inventoryModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-inventory-service.ts'
);
const fieldModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-field-service.ts'
);
const localModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-local-space-service.ts'
);

const player = { credits: 0, cargo: {}, reservedCargoTons: 0 };
const inventory = inventoryModule.createShipComponentInventoryService(player);
const field = {
  id: 'component-field',
  sourceLocationId: 'drift-wreck',
  seed: 42,
  width: 1000,
  height: 700,
  wrecks: [
    {
      id: 'component-wreck',
      name: 'Testwrack',
      kind: 'salvager',
      quality: 2,
      position: { x: 500, y: 350 },
      radius: 40,
      rotation: 0,
      integrity: 70,
      resources: [],
      component: {
        type: 'salvage',
        componentId: 'salvage2',
        recoveryDifficulty: 1,
        cargoTons: 16,
      },
      componentStatus: 'available',
      inspected: true,
    },
  ],
};
const setup = {
  available: true,
  yieldMultiplier: 1,
  chanceBonus: 30,
  cycleSeconds: 0.1,
  cargoCapacityTons: 100,
  reactorOutput: 40,
  continuousPowerUsed: 16,
};
const fieldService = fieldModule.createSalvageFieldService({
  field,
  setup,
  crewSkill: 100,
  collect() {
    return 0;
  },
  collectComponent(type, componentId, sourceWreckId, cargoCapacityTons) {
    return inventory.store(type, componentId, sourceWreckId, cargoCapacityTons) !== null;
  },
});

assert.equal(fieldService.componentChance('component-wreck'), 95);
const result = fieldService.recoverComponent('component-wreck');
assert.equal(result.outcome, 'recovered');
assert.equal(field.wrecks[0].componentStatus, 'recovered');
assert.equal(inventory.list().length, 1);
assert.equal(inventory.list()[0].name, 'Salvage Module Mk II');
assert.equal(inventory.list()[0].cargoTons, 16);
assert.equal(player.reservedCargoTons, 16);

const fullPlayer = {
  credits: 0,
  cargo: { steel: { qty: 90, totalCost: 0 } },
  reservedCargoTons: 0,
};
const fullInventory = inventoryModule.createShipComponentInventoryService(fullPlayer);
assert.equal(
  fullInventory.store('salvage', 'salvage2', 'blocked-wreck', 100),
  null,
  'loose components must respect the real physical cargo capacity'
);

const localField = {
  ...field,
  wrecks: [
    {
      ...field.wrecks[0],
      id: 'local-component-wreck',
      componentStatus: 'available',
      component: {
        type: 'salvage',
        componentId: 'salvage1',
        recoveryDifficulty: 1,
        cargoTons: 12,
      },
    },
  ],
};
const localInventory = inventoryModule.createShipComponentInventoryService({
  credits: 0,
  cargo: {},
  reservedCargoTons: 0,
});
const local = localModule.createSalvageLocalSpaceService({
  field: localField,
  setup,
  crewSkill: 100,
  approachSpeed: 500,
  collect() {
    return 0;
  },
  collectComponent(type, componentId, sourceWreckId, capacity) {
    return localInventory.store(type, componentId, sourceWreckId, capacity) !== null;
  },
});
local.selectWreck('local-component-wreck');
local.startComponentRecovery('local-component-wreck');
for (let index = 0; index < 500; index += 1) local.tick(0.05);
assert.equal(local.getSnapshot().componentRecoverySerial, 1);
assert.equal(localInventory.list().length, 1);

console.log('PASS physical loose-component recovery, cargo reservation and local extraction');
