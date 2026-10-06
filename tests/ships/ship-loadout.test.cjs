'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const loadouts = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-loadout-service.ts');
const components = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);

const service = loadouts.createShipLoadoutService();

for (const ship of ships.getAllShipDefinitions()) {
  const installed = service.get(ship);
  for (const type of ['reactor', 'engine', 'shield', 'hull', 'sensor', 'cargo']) {
    const id = installed[type]?.[0];
    assert(id, ship.id + ' must start with ' + type + ' Mk I installed');
    assert.equal(components.getShipComponent(type, id).tier, 1);
  }

  const stats = ships.getShipGameplayStats(ship.id);
  assert(stats);
  const weaponSlots = stats.weaponSlots;
  assert.equal(installed.weapon?.length, weaponSlots);
  for (const id of installed.weapon ?? []) {
    assert.equal(components.getShipComponent('weapon', id).tier, 1);
  }

  if (ship.role === 'mining') assert.equal(installed.mining?.[0], 'mining1');
  if (ship.role === 'salvage') assert.equal(installed.salvage?.[0], 'salvage1');

  if (weaponSlots > 0) {
    assert.equal(service.setSlot(ship, 'weapon', 0, null), true);
    assert.equal(service.get(ship).weapon[0], '', 'weapon slot must become visibly empty');
    assert.equal(service.setSlot(ship, 'weapon', 0, 'weapon1'), true);
    assert.equal(service.get(ship).weapon[0], 'weapon1', 'Mk I weapon must mount into the slot');
  }
}

console.log('PASS all player ships start with complete Mk I loadouts and mountable weapons');
