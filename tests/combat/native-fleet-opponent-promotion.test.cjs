'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createParallelNativeDuels } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/parallel-native-duels.ts'
);

function ship(id, team) {
  return {
    id,
    team,
    setup: {
      id,
      name: id,
      shipId: 'patrol-60m',
      shieldHp: 1000,
      hullHp: 1200,
      weapons: [],
      hitChance: 0.7,
      dodgeChance: 0.1,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 100,
      preferredTactic: 'fight',
    },
  };
}
const roster = (a, b) => [
  ...Array.from({ length: a }, (_, i) => ship('a' + (i + 1), 'a')),
  ...Array.from({ length: b }, (_, i) => ship('b' + (i + 1), 'b')),
];
const arena = () => ({ width: 4200, height: 2600, asteroids: [], obstacles: [] });
const main = (snapshot) => snapshot.engagements.filter((link) => link.role === 'duel');
const extra = (snapshot) => snapshot.engagements.filter((link) => link.role === 'support');

// 1v3 -> 1v2 -> 1v1 -> finished. The actual live AI targets are reciprocal,
// not merely decorated with a misleading duel badge.
const fleet = createParallelNativeDuels(roster(1, 3), arena(), 8181);
const a1 = fleet.duels[0].getParallelActor('attacker');
const b1 = fleet.duels[0].getParallelActor('defender');
const b2 = fleet.supporters[0].getParallelActor('attacker');
const b3 = fleet.supporters[1].getParallelActor('attacker');
b2.position.x = a1.position.x + 380;
b2.position.y = a1.position.y;
b3.position.x = a1.position.x + 1100;
b3.position.y = a1.position.y + 350;
assert.deepEqual(main(fleet.getSnapshot()).map((link) => [link.sourceId, link.targetId]), [
  ['a1', 'b1'],
]);
assert.equal(extra(fleet.getSnapshot()).length, 2);

// B1 destroyed: B2 is promoted to the *real* main opponent, B3 stays extra.
b1.hullHp = 0;
fleet.tick(0.08);
let snapshot = fleet.getSnapshot();
assert.strictEqual(fleet.duels[0].getParallelActor('attacker'), a1);
assert.strictEqual(fleet.duels[0].getParallelActor('defender'), b2);
assert.strictEqual(fleet.supporters[0].getParallelActor('attacker'), b2);
assert.strictEqual(fleet.supporters[0].getParallelActor('defender'), a1);
assert.deepEqual(main(snapshot).map((link) => [link.label, link.sourceId, link.targetId]), [
  ['1', 'a1', 'b2'],
]);
assert.deepEqual(extra(snapshot).map((link) => [link.sourceId, link.targetId]), [['b3', 'a1']]);
assert.equal(snapshot.finished, false);

// The two separate original native owners must each tick exactly once.
a1.tractorThrowCooldown = 3;
b2.tractorThrowCooldown = 3;
const a1Shield = a1.shieldHp;
const b2Shield = b2.shieldHp;
fleet.tick(0.08);
assert(Math.abs(a1.tractorThrowCooldown - 2.92) < 1e-9);
assert(Math.abs(b2.tractorThrowCooldown - 2.92) < 1e-9);
assert.equal(a1.shieldHp, a1Shield);
assert.equal(b2.shieldHp, b2Shield);

// The newly promoted primary dies: B3 takes its place, still as D1.
b2.hullHp = 0;
fleet.tick(0.08);
snapshot = fleet.getSnapshot();
assert.strictEqual(fleet.duels[0].getParallelActor('defender'), b3);
assert.strictEqual(fleet.supporters[1].getParallelActor('defender'), a1);
assert.deepEqual(main(snapshot).map((link) => [link.sourceId, link.targetId]), [['a1', 'b3']]);
assert.equal(extra(snapshot).length, 0);
assert.equal(snapshot.finished, false);
b3.hullHp = 0;
fleet.tick(0.08);
assert.equal(fleet.getSnapshot().finished, true);
assert.equal(fleet.getSnapshot().engagements.length, 0);

// Symmetry: B1 can promote A2 when A1 is destroyed (3 against 1).
const reverse = createParallelNativeDuels(roster(3, 1), arena(), 8182);
const firstA = reverse.duels[0].getParallelActor('attacker');
const firstB = reverse.duels[0].getParallelActor('defender');
const nextA = reverse.supporters[0].getParallelActor('attacker');
firstA.hullHp = 0;
reverse.tick(0.08);
assert.strictEqual(reverse.duels[0].getParallelActor('attacker'), nextA);
assert.strictEqual(reverse.supporters[0].getParallelActor('defender'), firstB);
assert.deepEqual(main(reverse.getSnapshot()).map((link) => [link.sourceId, link.targetId]), [
  ['b1', 'a2'],
]);
assert.equal(extra(reverse.getSnapshot()).length, 1);

// 5v5: joining a still-active pair remains extra and cannot steal its primary.
const five = createParallelNativeDuels(roster(5, 5), arena(), 8183);
five.duels[0].getParallelActor('defender').hullHp = 0;
five.tick(0.08);
assert.equal(main(five.getSnapshot()).length, 4);
assert.equal(extra(five.getSnapshot()).length, 1);
assert.equal(extra(five.getSnapshot())[0].sourceId, 'a1');
console.log('PASS FleetCombat real main-opponent promotion 1v3, 3v1 and 5v5 without double ticks');
