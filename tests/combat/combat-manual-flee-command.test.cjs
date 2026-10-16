'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 200,
    hullHp: 200,
    weapons: [],
    hitChance: 0.7,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 120,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
  };
}
const arena = {
  width: 2600,
  height: 1500,
  attackerPosition: { x: 1100, y: 750 },
  defenderPosition: { x: 1650, y: 750 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
  exitPoint: { x: 160, y: 750 },
  obstacles: [],
};
const combat = createStrategicCombatService(setup('runner'), setup('hunter'), 86, arena);
combat.tick(0.08);
combat.setTactic('attacker', 'flee');
const initial = combat.getSnapshot();
const first = combat.tick(0.08);
assert.equal(first.attacker.tactic, 'flee');
assert.equal(first.attacker.strategy?.kind, 'escape', 'player order replans immediately');
assert.equal(first.attacker.combatIntent, 'FLIEHEN');
assert(
  first.attacker.velocity.x < initial.attacker.velocity.x,
  'RCS should begin correcting velocity toward exit during a 180-degree turn'
);
const startX = initial.attacker.position.x;
let last = first;
for (let tick = 0; tick < 60 && !last.winner; tick += 1) last = combat.tick(0.08);
assert(last.attacker.position.x < startX - 25, 'flight must progress toward the exit');
assert.equal(last.attacker.tactic, 'flee', 'autonomous review cannot override manual escape');
combat.setTactic('attacker', 'fight');
const resumed = combat.tick(0.08);
assert.equal(resumed.attacker.tactic, 'fight');
assert.notEqual(resumed.attacker.strategy?.kind, 'escape');
console.log('PASS manual flee overrides attack immediately, moves to gate and can be cancelled');
