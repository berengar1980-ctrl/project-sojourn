'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/strategic-combat-service.ts'
);
function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 150,
    hullHp: 250,
    weapons: [],
    hitChance: 0.8,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 110,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
  };
}
const arena = {
  width: 3400,
  height: 1600,
  attackerPosition: { x: 1000, y: 800 },
  defenderPosition: { x: 1160, y: 800 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
  exitPoint: { x: 3240, y: 800 },
  obstacles: [],
};
for (const seed of [40, 41, 42, 43]) {
  const duel = createStrategicCombatService(setup('runner'), setup('blocker'), seed, arena);
  duel.setTactic('attacker', 'flee');
  let previous = duel.getSnapshot();
  let lowSpeedStreak = 0;
  let longestLowSpeed = 0;
  let maxX = previous.attacker.position.x;
  for (let frame = 0; frame < 400 && !previous.winner; frame += 1) {
    const now = duel.tick(0.08);
    maxX = Math.max(maxX, now.attacker.position.x);
    lowSpeedStreak = now.attacker.speed < 15 ? lowSpeedStreak + 0.08 : 0;
    longestLowSpeed = Math.max(longestLowSpeed, lowSpeedStreak);
    previous = now;
  }
  assert(
    longestLowSpeed < 8,
    'seed ' + seed + ': fleeing ship remains pinned to a blocking hull for too long'
  );
  assert(
    maxX > arena.attackerPosition.x + 180,
    'seed ' + seed + ': fleeing ship must physically progress past its initial interception'
  );
}
console.log('PASS physically simulated escapes move around a blocking pursuing ship');
