'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createParallelNativeDuels } = load('src/systems/combat/parallel-native-duels.ts');
const { fleetShipBadges, paintFleetEngagementLines, paintFleetShipBadges } = load(
  'src/ui/combat/fleet-engagement-markers.ts'
);

function ship(id, team) {
  return {
    id,
    team,
    setup: {
      id,
      name: id,
      shipId: 'patrol-60m',
      shieldHp: 500,
      hullHp: 800,
      weapons: [],
      hitChance: 0.7,
      dodgeChance: 0.1,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 120,
      preferredTactic: 'fight',
    },
  };
}
const roster = (a, b) => [
  ...Array.from({ length: a }, (_, i) => ship('a' + (i + 1), 'a')),
  ...Array.from({ length: b }, (_, i) => ship('b' + (i + 1), 'b')),
];
const arena = () => ({ width: 4200, height: 2600, obstacles: [], asteroids: [] });
const label = (links, id) => fleetShipBadges(links).find((badge) => badge.id === id)?.label;

// 5v5: the same numbered D1..D5 badge on BOTH members of every original duel.
const equal = createParallelNativeDuels(roster(5, 5), arena(), 1205);
const original = equal.getSnapshot();
assert.equal(original.engagements.length, 5);
assert(original.engagements.every((link) => link.role === 'duel'));
for (let i = 1; i <= 5; i++) {
  assert.equal(label(original.engagements, 'a' + i), 'D' + i);
  assert.equal(label(original.engagements, 'b' + i), 'D' + i);
}
assert.equal(fleetShipBadges(original.engagements).length, 10);

// After a destruction, the survivor keeps its original index but is marked as
// an EXTRA attacker; the remaining intact original pairs stay marked as duels.
equal.duels[0].getParallelActor('defender').hullHp = 0;
equal.tick(0.08);
const rejoined = equal.getSnapshot();
assert.equal(label(rejoined.engagements, 'a1'), '+1');
assert.equal(label(rejoined.engagements, 'b1'), undefined);
assert.equal(label(rejoined.engagements, 'a2'), 'D2');
assert.equal(label(rejoined.engagements, 'b2'), 'D2');
assert(rejoined.engagements.some((link) => link.sourceId === 'a1' && link.role === 'support'));

// 1v5: one real central duel; four additional attackers with separate + labels.
const uneven = createParallelNativeDuels(roster(1, 5), arena(), 1210).getSnapshot();
assert.equal(uneven.engagements.filter((link) => link.role === 'duel').length, 1);
assert.equal(uneven.engagements.filter((link) => link.role === 'support').length, 4);
assert.equal(label(uneven.engagements, 'a1'), 'D1');
assert.equal(label(uneven.engagements, 'b1'), 'D1');
for (let i = 2; i <= 5; i++) assert.equal(label(uneven.engagements, 'b' + i), '+' + (i - 1));
assert.equal(fleetShipBadges(uneven.engagements).length, 6);

// 2v3: when A2 becomes free, its +2 and B3's +1 links must point at
// each other, while A1/B1 continue to display their intact D1 pairing.
const peeled = createParallelNativeDuels(roster(2, 3), arena(), 1203);
const before = peeled.getSnapshot();
assert.equal(label(before.engagements, 'b3'), '+1');
assert.equal(label(before.engagements, 'a2'), 'D2');
peeled.duels[1].getParallelActor('defender').hullHp = 0;
peeled.tick(0.08);
const after = peeled.getSnapshot();
assert.equal(label(after.engagements, 'a1'), 'D1');
assert.equal(label(after.engagements, 'b1'), 'D1');
assert.equal(label(after.engagements, 'a2'), '+2');
assert.equal(label(after.engagements, 'b3'), '+1');
assert(
  after.engagements.some(
    (link) => link.sourceId === 'a2' && link.targetId === 'b3' && link.role === 'support'
  )
);
assert(
  after.engagements.some(
    (link) => link.sourceId === 'b3' && link.targetId === 'a2' && link.role === 'support'
  )
);
assert.equal(fleetShipBadges(after.engagements).length, 4);

const calls = { dashed: [], badges: [], strokes: 0 };
const painter = {
  save() {},
  restore() {},
  beginPath() {},
  setLineDash(dashes) { calls.dashed.push(dashes); },
  moveTo() {},
  lineTo() {},
  stroke() { calls.strokes++; },
  fillRect() {},
  strokeRect() {},
  fillText(value) { calls.badges.push(value); },
};
const shape = (entry) => ({
  center: entry.position,
  width: 65,
  height: 34,
  angle: entry.headingRadians,
});
const snapshots = [...after.duels, ...after.supporters];
paintFleetEngagementLines(painter, snapshots, after.engagements, new Set(), shape);
assert.equal(calls.strokes, 2, 'opposite support links between A2/B3 are painted only once');
assert(calls.dashed.some((dashes) => dashes.length > 0));
assert(calls.dashed.some((dashes) => dashes.length === 0));
paintFleetShipBadges(painter, snapshots, after.engagements, new Set(), shape, 4200, 2600);
assert.deepEqual(calls.badges.sort(), ['+1', '+2', 'D1', 'D1'].sort());

console.log('PASS FleetCombat live primary-pair badges, support-role transitions and deduped links');
