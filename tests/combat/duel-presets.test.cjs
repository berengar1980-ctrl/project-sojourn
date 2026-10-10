'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { DUEL_ENCOUNTERS, resolveDuelPreset } = loadStandaloneTypeScriptModule(
  root, 'src/ui/start/duel-presets.ts'
);
const { getAllShipDefinitions, fitsWeaponHardpoint } = loadStandaloneTypeScriptModule(
  root, 'src/systems/ships/index.ts'
);
const { getShipComponent } = loadStandaloneTypeScriptModule(
  root, 'src/systems/ships/ship-component-service.ts'
);
assert.equal(DUEL_ENCOUNTERS.length, 9);
assert.deepEqual(DUEL_ENCOUNTERS.map((entry) => entry.id), [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
]);
assert.equal(new Set(DUEL_ENCOUNTERS.map((entry) => entry.seed)).size, 9);
const ships = getAllShipDefinitions();
for (const encounter of DUEL_ENCOUNTERS) {
  const sides = resolveDuelPreset(encounter, ships);
  assert.equal(sides.length, 2, encounter.id);
  for (const side of sides) {
    const ship = ships.find((entry) => entry.id === side.shipId);
    assert(ship, encounter.id + ': ship exists');
    assert(side.weapons.some(Boolean), encounter.id + ': weapons configured');
    side.weapons.forEach((id, slotIndex) => {
      if (!id) return;
      const weapon = getShipComponent('weapon', id);
      assert(weapon?.weapon, encounter.id + ': weapon exists: ' + id);
      assert.equal(weapon.tier, 2, encounter.id + ': fixed MK II loadout');
      assert(fitsWeaponHardpoint(ship, slotIndex, weapon.weapon), encounter.id + ': valid hardpoint');
    });
  }
}
const panel = require('node:fs').readFileSync(path.join(root, 'src/ui/combat/strategic-combat-panel.ts'), 'utf8');
assert(panel.includes('model.elapsedSeconds'), 'combat panel shows actual simulation time');
assert(panel.includes('options.encounterName'), 'export identifies the scenario');
console.log('PASS nine fixed MK II encounter configurations and named combat timer');
