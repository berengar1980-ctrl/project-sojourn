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

// Regression: a dynamically joined third ship is a genuine replacement 1v1
// once the first opponent has been destroyed. There must still be a solid line.
const joinedFleet = createParallelNativeDuels(roster(1, 1), arena(), 1353);
assert.equal(joinedFleet.addShip(ship('b2', 'b')), true);
joinedFleet.getActor('b1').hullHp = 0;
joinedFleet.tick(0.08);
const replacementLinks = joinedFleet.getSnapshot().engagements;
assert(
  replacementLinks.some(
    (link) =>
      link.role === 'duel' &&
      [link.sourceId, link.targetId].includes('a1') &&
      [link.sourceId, link.targetId].includes('b2')
  ),
  'the surviving original ship and the joined attacker must retain a solid 1v1 line'
);
assert.equal(joinedFleet.getSnapshot().finished, false);

// 1v5: one real central duel; four additional attackers with separate + labels.
const uneven = createParallelNativeDuels(roster(1, 5), arena(), 1210).getSnapshot();
assert.equal(uneven.engagements.filter((link) => link.role === 'duel').length, 1);
assert.equal(uneven.engagements.filter((link) => link.role === 'support').length, 4);
assert.equal(label(uneven.engagements, 'a1'), 'D1');
assert.equal(label(uneven.engagements, 'b1'), 'D1');
for (let i = 2; i <= 5; i++) assert.equal(label(uneven.engagements, 'b' + i), '+' + (i - 1));
assert.equal(fleetShipBadges(uneven.engagements).length, 6);

// 2v3: A2 and B3 mutually target each other and become D2,
// while A1/B1 continue to display their intact D1 pairing.
const peeled = createParallelNativeDuels(roster(2, 3), arena(), 1203);
const before = peeled.getSnapshot();
const beforeSnapshots = [...before.duels, ...before.supporters];
assert.equal(label(before.engagements, 'b3'), '+1');
assert.equal(label(before.engagements, 'a2'), 'D2');
peeled.duels[1].getParallelActor('defender').hullHp = 0;
peeled.tick(0.08);
const after = peeled.getSnapshot();
assert.equal(label(after.engagements, 'a1'), 'D1');
assert.equal(label(after.engagements, 'b1'), 'D1');
assert.equal(label(after.engagements, 'a2'), 'D2');
assert.equal(label(after.engagements, 'b3'), 'D2');
assert(
  after.engagements.some(
    (link) => link.sourceId === 'a2' && link.targetId === 'b3' && link.role === 'duel'
  )
);
assert.equal(after.engagements.length, 2, 'a reciprocal main is only one visual engagement');
assert.equal(fleetShipBadges(after.engagements).length, 4);

// Once the original central opponent is destroyed, the survivor and a
// dynamically joined one-sided attacker can become a real new 1v1.
// The reinforcement is NOT one of the initial native duel services.
const { activeNativeFleetEngagements } = load('src/systems/combat/native-fleet-engagements.ts');
const mockShip = (id) => ({
  id,
  hullHp: 100,
  position: { x: id === 'survivor' ? 30 : 80, y: 45 },
  headingRadians: 0,
});
const survivor = mockShip('survivor');
const reinforcement = mockShip('reinforcement');
const third = mockShip('third');
const multiStates = [
  { winner: null, attacker: survivor, defender: reinforcement },
  { winner: null, attacker: reinforcement, defender: survivor },
  { winner: null, attacker: third, defender: survivor },
];
const promoted = activeNativeFleetEngagements(
  multiStates,
  ['attacker', 'attacker', 'attacker'],
  1,
  new Set()
);
assert.equal(promoted.filter((link) => link.role === 'duel').length, 1);
assert(
  promoted.some(
    (link) =>
      link.role === 'duel' &&
      [link.sourceId, link.targetId].includes('survivor') &&
      [link.sourceId, link.targetId].includes('reinforcement')
  ),
  'an extra ship can become the new solid-line 1v1 opponent'
);
assert(
  promoted.some((link) => link.role === 'support' && link.sourceId === 'third'),
  'remaining third-party attacks must retain their support line'
);

const calls = { dashed: [], badges: [], strokes: 0 };
const painter = {
  save() {},
  restore() {},
  beginPath() {},
  setLineDash(dashes) {
    calls.dashed.push(dashes);
  },
  moveTo() {},
  lineTo() {},
  stroke() {
    calls.strokes++;
  },
  fillRect() {},
  strokeRect() {},
  fillText(value) {
    calls.badges.push(value);
  },
};
const shape = (entry) => ({
  center: entry.position,
  width: 65,
  height: 34,
  angle: entry.headingRadians,
});
const snapshots = [...after.duels, ...after.supporters];
paintFleetEngagementLines(painter, beforeSnapshots, before.engagements, new Set(), shape);
assert.equal(calls.strokes, 3);
assert(calls.dashed.some((dashes) => dashes.length > 0));
assert(calls.dashed.some((dashes) => dashes.length === 0));
calls.strokes = 0;
calls.dashed = [];
paintFleetEngagementLines(painter, snapshots, after.engagements, new Set(), shape);
assert.equal(calls.strokes, 2, 'promoted reciprocal main gets one link');
assert(calls.dashed.every((dashes) => dashes.length === 0));
paintFleetShipBadges(painter, snapshots, after.engagements, new Set(), shape, 4200, 2600);
assert.deepEqual(calls.badges.sort(), ['D1', 'D1', 'D2', 'D2'].sort());

console.log(
  'PASS FleetCombat live primary-pair badges, support-role transitions and deduped links'
);
