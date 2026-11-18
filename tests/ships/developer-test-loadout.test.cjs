'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const { createShipLoadoutService } = load('src/systems/ships/ship-loadout-service.ts');
const { equipDeveloperTestShip } = load('src/systems/ships/ship-developer-test-loadout.ts');
const { getShipComponent, calculateShipEnergy } = load(
  'src/systems/ships/ship-component-service.ts'
);
const { isShipCombatWeaponSlotActive } = load('src/systems/ships/ship-combat-role-policy.ts');

const service = createShipLoadoutService();
const nonReactor = ['engine', 'shield', 'hull', 'armor', 'sensor', 'cargo'];
const expectedOptional = {
  mining: ['mining', 'tractor'],
  salvage: ['salvage', 'tractor'],
};
for (const ship of getAllShipDefinitions()) {
  assert.equal(getShipComponent('engine', service.get(ship).engine[0]).tier, 1);
  equipDeveloperTestShip(ship, service);
  const installed = service.get(ship);
  for (const type of [...nonReactor, ...(expectedOptional[ship.role] ?? [])]) {
    const part = getShipComponent(type, installed[type][0]);
    const expectedTier = type === 'shield' || type === 'hull' ? 3 : 2;
    assert.equal(part?.tier, expectedTier, ship.id + ': Mk ' + expectedTier + ' ' + type);
  }
  assert.equal(installed.hull[0], 'hull3', ship.id + ': Mk III hull');
  assert.equal(installed.shield[0], 'shield3', ship.id + ': Mk III shield');
  const reactor = getShipComponent('reactor', installed.reactor[0]);
  assert.equal(reactor?.tier, 3, ship.id + ': test generator must have independent tier');
  assert(
    calculateShipEnergy(installed).combatFree >= 0,
    ship.id + ': test ship must have enough reactor power to fire'
  );
  assert.equal(installed.weapon[0], 'weapon-railgun-3', ship.id + ': primary bow railgun');
  for (const [index, id] of installed.weapon.entries()) {
    if (!isShipCombatWeaponSlotActive(ship, index)) continue;
    const part = getShipComponent('weapon', id);
    assert(part, ship.id + ': every active weapon mount must be equipped');
    assert.equal(part.tier, index === 0 ? 3 : 2, ship.id + ': weapon tier ' + index);
    assert(service.canSetSlot(ship, 'weapon', index, id), ship.id + ': compatible mount');
  }
  equipDeveloperTestShip(ship, service);
  assert.deepEqual(service.get(ship), installed, ship.id + ': idempotent test loadout');
}

const normal = createShipLoadoutService();
const starter = getAllShipDefinitions()[0];
assert.equal(getShipComponent('engine', normal.get(starter).engine[0]).tier, 1);
console.log(
  'PASS developer switcher equips 28 hulls with Mk III hull/shields/reactor and bow railgun'
);
