'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { calculateShipModeEnergy } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const { duelInstalledComponents, duelCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/start/duel-combatant-setup.ts'
);
const { getAllShipDefinitions } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-catalog.ts'
);
const { advanceCombatPower } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-power-service.ts'
);
const { usefulRamAttempt } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ram-opportunity.ts'
);
const { missedShotEnd, missedShotAbove } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-miss-depth.ts'
);

const draft = {
  shipId: '',
  weapons: [],
  mines: [],
  crewId: '',
  reactorId: 'reactor1',
  engineId: 'engine6',
  shieldId: 'shield6',
  hullId: 'hull6',
  armorId: 'armor-front-6',
  sensorId: 'sensor6',
  tractorId: 'tractor6',
  miningId: 'mining6',
  salvageId: 'salvage6',
  cargoId: 'cargo6',
};
const installed = duelInstalledComponents(draft);
const power = calculateShipModeEnergy(installed);
assert.equal(power.output, 40);
assert(power.combat > power.output, 'over-equipping is accepted, not blocked by UI');
assert(power.industrial > power.output, 'industrial mode has its own demand');
assert.equal(power.total - power.combat, 35 + 33, 'industry sheds mining and salvage draws in combat');
const ships = getAllShipDefinitions();
const ship = ships.find((entry) => entry.role === 'salvage');
assert(ship);
const setup = duelCombatant(0, draft, ship);
assert(setup.hullHp > 82, 'reinforced hull module increases actual combat hull HP');
assert(setup.shieldHp > 81, 'selected shield increases actual combat shield HP');
assert.equal(setup.armor.front, 0.5, 'Mk VI forward armor reaches ram AI');
assert.equal(setup.power.combat, power.combat, 'combat setup uses canonical power budget');

const faulted = { setup: { power }, powerStress: 0, powerFaultRemaining: 0, boostActive: true };
assert.equal(advanceCombatPower(faulted, 0.08), false);
let tripped = false;
for (let n = 0; n < 60; n++) {
  tripped ||= advanceCombatPower(faulted, 0.08);
}
assert(tripped, 'sustained power excess causes a deterministic temporary brownout');
assert.equal(faulted.powerFault, 'total', 'major oversubscription disables propulsion and guns');
assert.equal(faulted.boostActive, false);
const stable = {
  setup: { power: { ...power, combat: 25 } },
  powerFault: 'total',
  powerFaultRemaining: 1,
};
advanceCombatPower(stable, 0.08);
assert.equal(stable.powerFault, undefined, 'normal supply clears the failure state');

const first = {
  setup: { armor: { front: 0.5, port: 0, starboard: 0 } },
  tactic: 'fight',
  position: { x: 500, y: 500 },
  hullHp: 82,
  hullMaxHp: 82,
  shieldHp: 0,
  shieldMaxHp: 81,
  subsystems: { engine: 82 },
};
const second = {
  setup: { armor: { port: 0, starboard: 0 } },
  position: { x: 950, y: 500 },
  hullHp: 68,
  hullMaxHp: 72,
  shieldHp: 0,
  shieldMaxHp: 88,
};
assert.equal(usefulRamAttempt(first, second), true, 'shieldless Mk VI bow may ram inferior hull');
first.setup.armor.front = 0;
assert.equal(usefulRamAttempt(first, second), false, 'unarmored zero-shield ram remains risky');
const origin = { x: 10, y: 50 };
const target = { x: 410, y: 50 };
const miss = missedShotEnd(origin, target);
assert.equal(miss.y, target.y, 'miss has no sideways deviation');
assert(miss.x > target.x && miss.x < target.x + 40);
assert.notEqual(missedShotAbove(2), missedShotAbove(3), 'miss layer alternates above and below');
const weaponSource = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-weapons.ts'),
  'utf8'
);
assert(!weaponSource.includes('Math.cos(target.headingRadians + Math.PI / 2)'));
console.log('PASS complete duel loadout, power brownout, shieldless ram and depth-projected misses');
