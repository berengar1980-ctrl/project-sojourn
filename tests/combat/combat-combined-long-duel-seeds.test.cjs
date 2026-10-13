'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { analyzeReproducibleDuel } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-duel-telemetry.ts'
);
const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol',
  shieldHp: 100,
  hullHp: 200,
  weapons: [],
  mines: [],
  hitChance: 0.7,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  aiControlled: true,
  preferredTactic: 'fight',
  combatSpeed: 120,
  turnRateRadiansPerSecond: 0.7,
  accelerationMetersPerSecond2: 25,
});
const arena = {
  width: 2400,
  height: 1600,
  attackerPosition: { x: 550, y: 800 },
  defenderPosition: { x: 1750, y: 800 },
  obstacles: [],
};
for (const seed of [101, 202, 303]) {
  const input = {
    name: 'Long-form tactic replay',
    seed,
    attacker: setup('alpha'),
    defender: setup('beta'),
    arena,
    maximumSeconds: 48,
  };
  const first = analyzeReproducibleDuel(input);
  const replay = analyzeReproducibleDuel(input);
  assert.deepEqual(first, replay, 'long duel log and outcome reproducible for seed ' + seed);
  assert(
    first.durationSeconds > 40,
    'unarmed long-duration test should traverse several planning cycles'
  );
  assert(first.durationSeconds <= 48);
  assert(Number.isFinite(first.minimumSeparation) && first.minimumSeparation >= 0);
  assert(
    Number.isFinite(first.maximumSeparation) && first.maximumSeparation >= first.minimumSeparation
  );
  assert(first.finalHulls.every((hp) => hp >= 0 && hp <= 200));
  assert(first.finalShields.every((hp) => hp >= 0 && hp <= 100));
  assert(first.log.every((entry) => Number.isFinite(entry.timeSeconds) && entry.timeSeconds >= 0));
}
console.log('PASS reproducible 48-second multi-seed tactic and telemetry replays');
