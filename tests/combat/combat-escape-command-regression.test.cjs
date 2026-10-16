'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { campaignCombatResult } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-result-summary.ts'
);

function ship(name, combatSpeed = 120, weapons = []) {
  return {
    id: name,
    name,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 1000,
    hullHp: 1000,
    weapons,
    hitChance: 0.8,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
  };
}

const arena = {
  width: 2600,
  height: 1500,
  exitPoint: { x: 160, y: 750 },
  attackerPosition: { x: 1100, y: 750 },
  defenderPosition: { x: 2180, y: 750 },
  attackerVelocity: { x: 45, y: 0 },
  attackerHeadingRadians: 0,
  obstacles: [],
};
const laser = {
  id: 'laser',
  name: 'Testlaser',
  weapon: {
    family: 'laser',
    mount: 'turret',
    shieldDamage: 5,
    hullDamage: 5,
    rangeMeters: 1300,
    cooldownSeconds: 0.8,
  },
};

function advance(combat, frames) {
  let last = combat.getSnapshot();
  let reversed = false;
  let offensiveFire = false;
  for (let index = 0; index < frames && !last.winner; index += 1) {
    last = combat.tick(0.08);
    if (last.attacker.velocity.x < 0) reversed = true;
    if (last.beams.some((beam) => beam.owner === 'attacker')) offensiveFire = true;
    if (last.projectiles.some((shot) => shot.owner === 'attacker')) offensiveFire = true;
  }
  return { last, reversed, offensiveFire };
}

const escape = createStrategicCombatService(
  ship('pilot', 120, [laser]),
  ship('pursuer', 85),
  86,
  arena
);
escape.setTactic('attacker', 'flee');
const clear = advance(escape, 1000);
assert.equal(clear.last.outcomeReason, 'escape', 'inertial turn reaches physical exit');
assert.equal(clear.last.winner, 'defender');
assert.equal(campaignCombatResult(clear.last).outcome, 'FLUCHT');
assert.equal(clear.last.attacker.tactic, 'flee');
assert(clear.reversed, 'ship actually reverses its starting velocity');
assert.equal(clear.offensiveFire, false, 'no new guns fire during manual retreat');

const asteroid = createStrategicCombatService(ship('rock-runner'), ship('tail', 80), 87, {
  ...arena,
  attackerVelocity: { x: 0, y: 0 },
  obstacles: [{ id: 'rock', position: { x: 700, y: 750 }, radius: 95 }],
});
asteroid.setTactic('attacker', 'flee');
const detour = advance(asteroid, 1100);
assert.equal(detour.last.outcomeReason, 'escape', 'rock detour ends at the actual exit');

const blocked = createStrategicCombatService(ship('blocked'), ship('guard', 80), 91, {
  ...arena,
  attackerPosition: { x: 172, y: 750 },
  defenderPosition: { x: 350, y: 750 },
});
blocked.setTactic('attacker', 'flee');
const rerouted = blocked.tick(0.08).exitPoint;
assert.notDeepEqual(rerouted, arena.exitPoint);
for (let index = 0; index < 850 && !blocked.getSnapshot().winner; index += 1) {
  assert.deepEqual(blocked.tick(0.08).exitPoint, rerouted, 'gate must not switch again');
}

const surrender = createStrategicCombatService(ship('captain'), ship('hunter'), 92, arena);
const before = surrender.getSnapshot();
surrender.surrender('attacker');
const result = surrender.getSnapshot();
assert.equal(result.outcomeReason, 'surrender');
assert.equal(result.winner, 'defender');
assert.equal(result.attacker.hullHp, before.attacker.hullHp);
assert.equal(result.defender.hullHp, before.defender.hullHp);
assert.equal(campaignCombatResult(result).outcome, 'NIEDERLAGE');
assert.deepEqual(surrender.tick(0.08), result, 'terminal duel stops advancing');

console.log('PASS long retreat, obstacle detour, stable alternative gate and surrender');
