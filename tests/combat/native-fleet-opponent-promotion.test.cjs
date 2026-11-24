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
assert.deepEqual(
  main(fleet.getSnapshot()).map((link) => [link.sourceId, link.targetId]),
  [['a1', 'b1']]
);
assert.equal(extra(fleet.getSnapshot()).length, 2);

// B1 destroyed: B2 is promoted to the *real* main opponent, B3 stays extra.
b1.hullHp = 0;
fleet.tick(0.08);
let snapshot = fleet.getSnapshot();
assert.strictEqual(fleet.duels[0].getParallelActor('attacker'), a1);
assert.strictEqual(fleet.duels[0].getParallelActor('defender'), b2);
assert.strictEqual(fleet.supporters[0].getParallelActor('attacker'), b2);
assert.strictEqual(fleet.supporters[0].getParallelActor('defender'), a1);
assert.deepEqual(
  main(snapshot).map((link) => [link.label, link.sourceId, link.targetId]),
  [['1', 'a1', 'b2']]
);
assert.deepEqual(
  extra(snapshot).map((link) => [link.sourceId, link.targetId]),
  [['b3', 'a1']]
);
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
assert.deepEqual(
  main(snapshot).map((link) => [link.sourceId, link.targetId]),
  [['a1', 'b3']]
);
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
assert.deepEqual(
  main(reverse.getSnapshot()).map((link) => [link.sourceId, link.targetId]),
  [['b1', 'a2']]
);
assert.equal(extra(reverse.getSnapshot()).length, 1);

// 5v5: joining a still-active pair remains extra and cannot steal its primary.
const five = createParallelNativeDuels(roster(5, 5), arena(), 8183);
five.duels[0].getParallelActor('defender').hullHp = 0;
five.tick(0.08);
assert.equal(main(five.getSnapshot()).length, 4);
assert.equal(extra(five.getSnapshot()).length, 1);
assert.equal(extra(five.getSnapshot())[0].sourceId, 'a1');
console.log('PASS FleetCombat real main-opponent promotion 1v3, 3v1 and 5v5 without double ticks');

const { shipContact } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ship-contact-geometry.ts'
);

function boardedFleet() {
  for (let seed = 1; seed < 40; seed++) {
    const ships = roster(1, 1).map((entry) => ({
      ...entry,
      setup: { ...entry.setup, aiControlled: true },
    }));
    const scenario = createParallelNativeDuels(ships, arena(), seed);
    const duel = scenario.duels[0];
    const attacker = scenario.getActor('a1');
    const defender = scenario.getActor('b1');
    defender.shieldHp = 0;
    for (const participant of [attacker, defender]) {
      participant.subsystems.engine = 0;
      participant.velocity = { x: 0, y: 0 };
    }
    attacker.position = { x: 1600, y: 1200 };
    defender.position = { x: 1670, y: 1200 };
    defender.position.x = attacker.position.x + shipContact(attacker, defender).required + 1;
    assert(duel.fireGrapple('attacker'));
    if (!duel.getSnapshot().grapple.success) continue;
    for (let i = 0; i < 12 && !duel.getStatus().boardingInitiator; i++) {
      attacker.headingRadians = defender.headingRadians = 0;
      attacker.velocity = { x: 0, y: 0 };
      defender.velocity = { x: 0, y: 0 };
      attacker.position = { x: 1600, y: 1200 };
      defender.position = { x: 1670, y: 1200 };
      defender.position.x = attacker.position.x + shipContact(attacker, defender).required + 1;
      scenario.tick(0.08);
    }
    assert.equal(duel.getStatus().boardingInitiator, 'attacker');
    return { fleet: scenario, duel, attacker, defender };
  }
  throw new Error('No successful deterministic boarding seed');
}

const timed = boardedFleet();
for (let i = 0; i < 124; i++) timed.fleet.tick(0.08);
assert.equal(timed.fleet.isFinished(), false, 'NPC boarding remains active for ten seconds');
assert.equal(timed.duel.getStatus().boardingInitiator, 'attacker');
timed.fleet.tick(0.08);
assert.equal(timed.fleet.isFinished(), true);
assert.equal(timed.duel.getStatus().boardingInitiator, null);
assert.equal([timed.attacker, timed.defender].filter((actor) => actor.hullHp > 0).length, 1);
assert.equal(
  timed.duel.getArena().asteroids.filter((body) => body.id.startsWith('fleet-wreck:')).length,
  1
);
assert.equal(timed.fleet.drainNpcBoardingResults().length, 1);
assert.equal(timed.fleet.drainNpcBoardingResults().length, 0);

const interrupted = boardedFleet();
const { getShipComponent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const outsider = ship('third', 'a');
outsider.setup.weapons = [getShipComponent('weapon', 'weapon1')];
outsider.position = {
  x: interrupted.defender.position.x + 230,
  y: interrupted.defender.position.y,
};
outsider.headingRadians =
  outsider.setup.weapons[0].weapon.mount === 'broadside' ? -Math.PI / 2 : Math.PI;
assert(interrupted.fleet.addShip(outsider, undefined, 'b1'));
const external = interrupted.fleet.supporters[0];
interrupted.fleet.getActor(outsider.id).cooldowns[0] = 0;
assert.equal(external.getStatus().defenderId, 'b1');
const before = { ...interrupted.defender.position };
interrupted.fleet.tick(0.08);
assert(external.getSnapshot().elapsedSeconds > 0, 'third-party combat keeps ticking');
assert(
  external.getSnapshot().attacker.weaponTelemetry[0].shotsFired > 0,
  'a third party can fire on the coupled target'
);
assert.deepEqual(interrupted.defender.position, before, 'the coupled target stays in place');
interrupted.defender.hullHp = 0;
interrupted.fleet.tick(0.08);
assert.equal(interrupted.attacker.hullHp, 0);
assert.equal(interrupted.duel.getStatus().boardingInitiator, null);
const interruptedWrecks = interrupted.duel
  .getArena()
  .asteroids.filter((body) => body.id.startsWith('fleet-wreck:'));
assert.deepEqual(
  interruptedWrecks.map((body) => [body.id, body.kind]).sort(),
  [
    ['fleet-wreck:a1', 'resource'],
    ['fleet-wreck:b1', 'resource'],
  ],
  'both boarding losses become exactly one solid route-blocking wreck each'
);
