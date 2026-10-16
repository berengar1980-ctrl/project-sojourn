'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const rail = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === 'weapon-railgun-1');
assert(rail);
function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 200,
    hullHp: 200,
    weapons: [rail],
    weaponMounts: [{ slotIndex: 0, x: 0, y: 0, facing: 'forward' }],
    hitChance: 0.8,
    dodgeChance: 0.05,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 120,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
    aiAggression: 90,
  };
}
const arena = {
  width: 4200,
  height: 2600,
  attackerPosition: { x: 1200, y: 1300 },
  defenderPosition: { x: 2100, y: 1300 },
  attackerHeadingRadians: Math.PI / 2,
  defenderHeadingRadians: Math.PI,
  obstacles: [],
};
const battle = createStrategicCombatService(setup('front'), setup('target'), 86, arena);
const first = battle.tick(0.08);
assert(
  first.attacker.angularThrust < -0.1,
  'forward gun must turn toward opponent even during lateral flight'
);
let latest = first;
for (let tick = 0; tick < 35; tick += 1) latest = battle.tick(0.08);
assert(latest.attacker.speed > 1, 'weapon tracking must not immobilize the ship');
const passing = createStrategicCombatService(setup('passing'), setup('opponent'), 86, {
  ...arena,
  attackerVelocity: { x: 100, y: 0 },
});
const flyby = passing.tick(0.08);
assert.notEqual(
  flyby.attacker.combatIntent,
  'ANGRIFFSPASSAGE',
  'a frontal ship must finish turning before committing to a flyby'
);
assert(flyby.attacker.speed > 60, 'committed passage must retain actual ship momentum');
console.log('PASS forward-gun aiming and committed flybys remain independent');
