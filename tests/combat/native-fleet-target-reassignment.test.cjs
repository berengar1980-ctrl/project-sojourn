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

function fleeAtGate(actor, gate) {
  const cx = 2100;
  const cy = 1300;
  const dx = cx - gate.x;
  const dy = cy - gate.y;
  const magnitude = Math.max(1, Math.hypot(dx, dy));
  actor.position.x = gate.x + (dx / magnitude) * 50;
  actor.position.y = gate.y + (dy / magnitude) * 50;
  actor.tactic = 'flee';
  actor.combatTacticLocked = true;
}

// One of two ordinary 1v1 fights resolves: the free ship joins the closest
// remaining fight, without cloning or taking ownership of its other actors.
const joined = createParallelNativeDuels(roster(2, 2), arena(), 1201);
const freeA = joined.duels[0].getParallelActor('attacker');
const lostB = joined.duels[0].getParallelActor('defender');
const fightingA = joined.duels[1].getParallelActor('attacker');
const fightingB = joined.duels[1].getParallelActor('defender');
lostB.hullHp = 0;
joined.tick(0.08);
assert.strictEqual(joined.duels[0].getParallelActor('attacker'), freeA);
assert.strictEqual(joined.duels[0].getParallelActor('defender'), fightingB);
assert.strictEqual(joined.duels[1].getParallelActor('attacker'), fightingA);
assert.strictEqual(joined.duels[1].getParallelActor('defender'), fightingB);
assert.equal(joined.getSnapshot().duels[0].winner, null);
assert.equal(joined.getSnapshot().finished, false, 'ongoing 2v1 is not a finished fleet battle');
fightingB.tractorThrowCooldown = 2;
joined.tick(0.08);
assert(
  Math.abs(fightingB.tractorThrowCooldown - 1.92) < 1e-9,
  'joining a pair never ticks the shared opponent twice'
);

// Escaping rather than dying releases the other participant for reassignment.
const retreated = createParallelNativeDuels(roster(2, 2), arena(), 1202);
const retreatGate = retreated.getSnapshot().duels[0].exitPoint;
const escapingB = retreated.duels[0].getParallelActor('defender');
const remainingB = retreated.duels[1].getParallelActor('defender');
fleeAtGate(escapingB, retreatGate);
retreated.tick(0.08);
assert(retreated.getSnapshot().escapedShipIds.includes('b1'));
assert.strictEqual(retreated.duels[0].getParallelActor('defender'), remainingB);
const exitedPosition = { ...escapingB.position };
retreated.tick(0.08);
assert.deepEqual(escapingB.position, exitedPosition, 'escaped ship must never move again');
assert(retreated.getSnapshot().escapedShipIds.includes('b1'));

// A1 is fighting B1. B3 additionally attacks A1, while A2 fights B2.
// Once B2 is gone, A2 must PEEL B3 off A1, not overwrite A1's focus on B1.
const peel = createParallelNativeDuels(roster(2, 3), arena(), 1203);
const originalA1 = peel.duels[0].getParallelActor('attacker');
const originalB1 = peel.duels[0].getParallelActor('defender');
const freeA2 = peel.duels[1].getParallelActor('attacker');
const extraB3 = peel.supporters[0].getParallelActor('attacker');
assert.strictEqual(peel.supporters[0].getParallelActor('defender'), originalA1);
peel.duels[1].getParallelActor('defender').hullHp = 0;
peel.tick(0.08);
assert.strictEqual(peel.duels[0].getParallelActor('attacker'), originalA1);
assert.strictEqual(peel.duels[0].getParallelActor('defender'), originalB1);
assert.strictEqual(peel.duels[1].getParallelActor('attacker'), freeA2);
assert.strictEqual(peel.duels[1].getParallelActor('defender'), extraB3);
assert.strictEqual(
  peel.supporters[0].getParallelActor('defender'),
  freeA2,
  'the additional attacker must be intercepted and change focus'
);
extraB3.tractorThrowCooldown = 2;
freeA2.tractorThrowCooldown = 2;
peel.tick(0.08);
assert(Math.abs(extraB3.tractorThrowCooldown - 1.92) < 1e-9);
assert(Math.abs(freeA2.tractorThrowCooldown - 1.92) < 1e-9);

// The peeled secondary attacker may flee; its interceptor must go back and
// reinforce a surviving fight. The original A1/B1 pair stays intact.
const gate = peel.getSnapshot().duels[0].exitPoint;
fleeAtGate(extraB3, gate);
peel.tick(0.08);
assert(peel.getSnapshot().escapedShipIds.includes('b3'));
assert.strictEqual(peel.duels[1].getParallelActor('defender'), originalB1);
assert.strictEqual(peel.duels[0].getParallelActor('defender'), originalB1);

// With no overloaded friendly, the survivor of a 3v3 joins the geographically
// closest live opponent, not the highest/lowest indexed service.
const nearest = createParallelNativeDuels(roster(3, 3), arena(), 1204);
const nearestB = nearest.duels[1].getParallelActor('defender');
nearest.duels[0].getParallelActor('defender').hullHp = 0;
nearest.tick(0.08);
assert.strictEqual(
  nearest.duels[0].getParallelActor('defender'),
  nearestB,
  'free ship should join its nearest ongoing fight'
);
assert.strictEqual(nearest.duels[1].getParallelActor('defender'), nearestB);

// The same rejoin rule must apply to large fleets rather than only 1vN.
const five = createParallelNativeDuels(roster(5, 5), arena(), 1205);
five.duels[0].getParallelActor('defender').hullHp = 0;
five.tick(0.08);
assert.equal(five.getSnapshot().duels[0].winner, null);
assert.equal(five.getSnapshot().finished, false);
assert.equal(five.getSnapshot().duels.length, 5);
assert.equal(five.getSnapshot().supporters.length, 0);
assert.equal(
  five.getSnapshot().duels[0].arena.asteroids.filter((rock) => rock.id === 'fleet-wreck:b1').length,
  1
);


// Two independent kills leave one survivor on EACH team. The original
// winner services must resume as reciprocal single-owner attackers.
const crossed = createParallelNativeDuels(roster(2, 2), arena(), 1210);
const crossedA = crossed.duels[0].getParallelActor('attacker');
const crossedB = crossed.duels[1].getParallelActor('defender');
crossed.duels[0].getParallelActor('defender').hullHp = 0;
crossed.duels[1].getParallelActor('attacker').hullHp = 0;
crossed.tick(0.08);
assert.equal(crossed.getSnapshot().finished, false);
assert.strictEqual(crossed.duels[0].getParallelActor('defender'), crossedB);
assert.strictEqual(crossed.duels[1].getParallelActor('attacker'), crossedA);
assert.equal(crossed.duels[0].getSnapshot().winner, null);
assert.equal(crossed.duels[1].getSnapshot().winner, null);
crossedA.tractorThrowCooldown = 3;
crossedB.tractorThrowCooldown = 3;
crossed.tick(0.08);
assert(Math.abs(crossedA.tractorThrowCooldown - 2.92) < 1e-9);
assert(Math.abs(crossedB.tractorThrowCooldown - 2.92) < 1e-9);

// A target already marked escaped by another native service prevents its
// original duel from ticking. Fleet reassignment must still release its
// surviving owner, rather than waiting forever for a local winner.
const { reassignNativeFleetTargets } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/native-fleet-reassignment.ts'
);
const orphan = createParallelNativeDuels(roster(2, 2), arena(), 1211);
const orphanA = orphan.duels[0].getParallelActor('attacker');
const orphanB = orphan.duels[1].getParallelActor('defender');
const orphanDrivers = ['both', 'both'];
reassignNativeFleetTargets({
  services: orphan.duels,
  drivers: orphanDrivers,
  ships: orphan.duels.flatMap((duel) => [
    duel.getParallelActor('attacker'),
    duel.getParallelActor('defender'),
  ]),
  teams: new Map([
    ['a1', 'a'],
    ['a2', 'a'],
    ['b1', 'b'],
    ['b2', 'b'],
  ]),
  escaped: new Set(['b1']),
});
assert.strictEqual(orphan.duels[0].getParallelActor('attacker'), orphanA);
assert.strictEqual(orphan.duels[0].getParallelActor('defender'), orphanB);
assert.equal(orphanDrivers[0], 'attacker');
assert.equal(orphan.duels[0].getSnapshot().winner, null);
orphanA.tractorThrowCooldown = 2;
orphan.duels[0].tick(0.08);
assert(Math.abs(orphanA.tractorThrowCooldown - 1.92) < 1e-9);

// Three independent factions and neutral relations must not be collapsed
// into the two sides of the current PvP scenario editor.
const { hasActiveFleetHostilities } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/native-fleet-hostility.ts'
);
const factionShips = ['pirates', 'traders', 'patrol'].map((faction) => ({
  setup: { id: faction },
  hullHp: 100,
}));
const factions = new Map([
  ['pirates', 'pirates'],
  ['traders', 'traders'],
  ['patrol', 'patrol'],
]);
const factionsHostile = (a, b) =>
  (a === 'pirates' && b === 'patrol') || (a === 'patrol' && b === 'pirates');
assert.equal(
  hasActiveFleetHostilities(factionShips, new Set(), factions, factionsHostile),
  true,
  'the third faction can keep combat active without A/B teams'
);
assert.equal(
  hasActiveFleetHostilities(factionShips, new Set(['pirates']), factions, factionsHostile),
  false,
  'remaining neutral factions must not fight solely because their IDs differ'
);
assert.equal(
  hasActiveFleetHostilities(factionShips, new Set(['traders']), factions, factionsHostile),
  true,
  'removing a neutral faction must not end an ongoing hostile encounter'
);

console.log(
  'PASS 2v2/2v3/3v3/5v5 free ship reinforcement, escape and secondary attacker interception'
);
