'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { analyzeCombatLog } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-log-analysis.ts'
);
const log = [
  { timeSeconds: 0, side: 'system', event: 'start', detail: 'Seed 70' },
  { timeSeconds: 0, side: 'attacker', event: 'plan', detail: 'shield_breaker' },
  { timeSeconds: 0.08, side: 'attacker', event: 'phase', detail: 'reach_range' },
  { timeSeconds: 4, side: 'defender', event: 'plan', detail: 'broadside' },
  { timeSeconds: 4.1, side: 'attacker', event: 'impact', detail: 'shield · 12 HP' },
  { timeSeconds: 6, side: 'defender', event: 'impact', detail: 'hull · 3 HP' },
  { timeSeconds: 8, side: 'system', event: 'result', detail: 'attacker wins' },
];
const summary = analyzeCombatLog(log);
assert.equal(summary.durationSeconds, 8);
assert.equal(summary.winner, 'attacker wins');
assert.equal(summary.plans.attacker, 1);
assert.equal(summary.plans.defender, 1);
assert.equal(summary.phaseChanges.attacker, 1);
assert.equal(summary.shieldHits, 1);
assert.equal(summary.hullHits, 1);
assert.equal(summary.totalDamage, 15);
console.log('PASS combat log summary supports reproducible battle analysis');
