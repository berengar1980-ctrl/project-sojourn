'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/strategic-combat-service.ts'
);
const weapon = {
  id: 'test-rail',
  name: 'Railgun I',
  type: 'weapon',
  tier: 1,
  power: 1,
  cost: 0,
  weapon: {
    family: 'railgun', mount: 'forward', rangeMeters: 1550,
    shieldDamage: 10, hullDamage: 20, cooldownSeconds: 6,
    heat: 0, ammoPerShot: 1, arcDegrees: 60,
  },
};
const setup = (id) => ({
  id, name: id, shipId: 'patrol', shieldHp: 100, hullHp: 100,
  weapons: [weapon], hitChance: 0.7, dodgeChance: 0, damageMultiplier: 1,
  criticalChance: 0, cycleTimeMultiplier: 1, combatSpeed: 110,
  aiControlled: true, aiAggression: 90,
});
for (const [seed, first, second] of [
  [70, 'attacker', 'defender'],
  [71, 'defender', 'attacker'],
]) {
  const fight = createStrategicCombatService(setup('A'), setup('B'), seed);
  let state = fight.getSnapshot();
  assert.equal(state[first].nextStrategyReviewAt, 0);
  assert.equal(state[second].nextStrategyReviewAt, 4);
  assert(state.combatLog.some((entry) => entry.event === 'start' && entry.detail.includes('Railgun I')));
  state = fight.tick(0.08);
  assert(state[first].strategy);
  assert.equal(state[second].strategy, null);
  assert.equal(state[first].nextStrategyReviewAt, 8);
  assert(state.combatLog.some((entry) => entry.event === 'plan' && entry.side === first));
  assert(state.combatLog.some((entry) => entry.event === 'phase' && entry.side === first));
  for (let i = 0; i < 50; i++) state = fight.tick(0.08);
  assert(state[second].strategy);
  assert.equal(state[second].nextStrategyReviewAt, 12);
  const log = fight.getCombatLog();
  assert(log.some((entry) => entry.event === 'state' && entry.detail.includes('Abstand')),
    'movement telemetry must expose distance and current plan phase');
  log[0].detail = 'corrupted';
  assert.notEqual(fight.getCombatLog()[0].detail, 'corrupted', 'logs must be detached');
}
console.log('PASS seeded four-second stagger, eight-second plans and independent telemetry');
