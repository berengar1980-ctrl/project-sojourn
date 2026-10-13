'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { analyzeReproducibleDuel, formatDuelTelemetry, DUEL_ANALYSIS_STEP } =
  loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-duel-telemetry.ts');
assert.equal(DUEL_ANALYSIS_STEP, 0.08);
const setup = (id) => ({
  id, name: id, shipId: 'patrol',
  shieldHp: 100, hullHp: 200, weapons: [],
  hitChance: 0.7, dodgeChance: 0.1, damageMultiplier: 1,
  criticalChance: 0, cycleTimeMultiplier: 1,
  aiControlled: true, combatSpeed: 120,
});
const input = {
  name: 'Alpha analysis replay', seed: 1001,
  attacker: setup('a'), defender: setup('b'),
  arena: { width: 2400, height: 1600, obstacles: [] },
  maximumSeconds: 2.4,
};
const a = analyzeReproducibleDuel(input);
const b = analyzeReproducibleDuel(input);
assert.deepEqual(a, b, 'same seed and inputs must yield identical logs and results');
assert.equal(a.seed, 1001);
assert(a.durationSeconds <= 2.4);
assert(a.minimumSeparation <= a.maximumSeparation);
assert.equal(a.timedOut, true);
const report = formatDuelTelemetry(a);
assert(report.includes('Seed: 1001'));
assert(report.includes('## Timestamped events'));
assert(report.includes('[0.00s]'));
assert.equal(report, formatDuelTelemetry(b), 'text export must be deterministic');
console.log('PASS deterministic fixed-step duel replay and timestamped telemetry');
