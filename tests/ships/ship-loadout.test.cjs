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
  assert(
    components.calculateShipEnergy(installed).combatFree >= 0,
    ship.id + ' must power its starting gun without overloading the Mk I reactor'
  );
  const starterGuns = (installed.weapon ?? []).filter(Boolean);
  assert.equal(starterGuns.length, 1, ship.id + ' must start with exactly one usable gun');
  assert.equal(
    installed.weapon?.[3],
    'weapon1',
    ship.id + ' must start with a 360-degree light pulse laser in turret slot 3'
  );
  assert(
    (installed.weapon ?? []).every((id, index) => {
      if (!id) return true;
      const weapon = components.getShipComponent('weapon', id)?.weapon;
      return Boolean(weapon && loadouts.fitsWeaponHardpoint(ship, index, weapon));
    }),
    ship.id + ' must never start with an incompatible weapon mount'
  );
  for (const id of installed.weapon ?? []) {
    if (id) assert.equal(components.getShipComponent('weapon', id).tier, 1);
  }

  if (ship.role === 'mining') assert.equal(installed.mining?.[0], 'mining1');
  if (ship.role === 'salvage') assert.equal(installed.salvage?.[0], 'salvage1');

  assert.equal(weaponSlots, 6, 'all ship types share the new six-slot configuration');
  assert.equal(service.setSlot(ship, 'weapon', 3, null), true);
  assert.equal(service.get(ship).weapon[3], '', 'turret slot must become visibly empty');
  assert.equal(service.setSlot(ship, 'weapon', 3, 'weapon1'), true);
  assert.equal(service.get(ship).weapon[3], 'weapon1', 'pulse laser belongs on turret mount');
  assert.equal(service.setSlot(ship, 'weapon', 0, 'weapon1'), false);
  assert.equal(service.setSlot(ship, 'weapon', 0, 'weapon-railgun-1'), true);
}

console.log(
  'PASS all player ships expose configured directional mounts and valid starter loadouts'
);
