'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { moveCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-movement.ts'
);
const { reviewCombatStrategy } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-strategy-planner.ts'
);
const rail = {
  id: 'fixed-forward-test',
  name: 'Heavy frontal weapon',
  weapon: {
    family: 'railgun',
    mount: 'forward',
    rangeMeters: 1450,
    arcDegrees: 25,
    shieldDamage: 200,
    hullDamage: 240,
    cooldownSeconds: 4,
  },
};
const arena = {
  width: 2500,
  height: 1600,
  attackerPosition: { x: 700, y: 800 },
  defenderPosition: { x: 1550, y: 800 },
  attackerHeadingRadians: Math.PI / 2,
  defenderHeadingRadians: Math.PI,
};
const setup = (id, weapons) => ({
  id,
  name: id,
  shipId: 'patrol-test',
  shieldHp: 300,
  hullHp: 300,
  weapons,
  weaponMounts: weapons.map((_, slotIndex) => ({
    slotIndex,
    x: 0,
    y: 0,
    facing: 'forward',
  })),
  hitChance: 1,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  combatSpeed: 120,
  accelerationMetersPerSecond2: 35,
  turnRateRadiansPerSecond: 0.8,
  aiControlled: true,
});
const attacker = createCombatant(setup('front', [rail]), 'attacker', arena);
const defender = createCombatant(setup('target', []), 'defender', arena);
reviewCombatStrategy(attacker, defender, 'attacker', 0);
assert.equal(attacker.strategy.focus, 'forward');
attacker.strategy = { ...attacker.strategy, phase: 'align_weapons' };
reviewCombatStrategy(attacker, defender, 'attacker', 8);
assert.equal(
  attacker.strategy.phase,
  'align_weapons',
  'review cannot restart an equivalent maneuver'
);
let firstPassHeadingError = null;
let correctedHeading = false;
for (let step = 0; step < 60; step += 1) {
  moveCombatant(attacker, defender, 'attacker', 0.08, arena, []);
  const bearing = Math.atan2(
    defender.position.y - attacker.position.y,
    defender.position.x - attacker.position.x
  );
  const error = Math.atan2(
    Math.sin(bearing - attacker.headingRadians),
    Math.cos(bearing - attacker.headingRadians)
  );
  correctedHeading ||= Math.abs(error) < 0.25;
  if (attacker.flightPass) {
    firstPassHeadingError = Math.abs(error);
    break;
  }
}
assert(correctedHeading, 'forward assault must finish turning toward the target');
assert(
  firstPassHeadingError === null || firstPassHeadingError < 0.28,
  'frontal flyby cannot interrupt incomplete bow alignment'
);
console.log('PASS frontal attack aligns before pass and retains plan phase');
