'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { fireCombatGrapple, advanceCombatGrapple } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-grapple-service.ts'
);
const { advanceCombatGrappleTether } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-grapple-physics.ts'
);
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);

const sourcePoint = { x: 300, y: 400 };
const targetPoint = { x: 900, y: 400 };
const hook = fireCombatGrapple('attacker', sourcePoint, targetPoint, 0, 100, 100, false, () => 0);
assert(hook && hook.success);
const attached = advanceCombatGrapple(hook, sourcePoint, targetPoint, 0.65);
assert(attached.resolved);

function ship(id, x, tractorRangeMeters = 0) {
  return {
    setup: { tractorRangeMeters },
    id,
    position: { x, y: 400 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    shieldHp: 0,
    hullHp: 100,
  };
}

const attacker = ship('attacker', 300);
const defender = ship('defender', 900);
defender.velocity.y = 34;
const rope = advanceCombatGrappleTether(attached, attacker, defender, 0.08);
assert(rope.ropeLength < attached.ropeLength, 'winch must reel in the rope');
assert(rope.tension > 0, 'a shortening taut rope must exert tension');
assert(attacker.velocity.x > 0 && defender.velocity.x < 0, 'both ships must be pulled');
assert.equal(defender.velocity.y, 34, 'the rope must preserve tangential drift');
assert.equal(attacker.velocity.x + defender.velocity.x, 0, 'the tug must conserve pair momentum');
assert(!rope.tractorAssisted);

function simulatedReel(tractorRangeMeters) {
  const a = ship('attacker', 300, tractorRangeMeters);
  const b = ship('defender', 900);
  let line = attached;
  let steps = 0;
  for (; steps < 180; steps += 1) {
    line = advanceCombatGrappleTether(line, a, b, 0.08);
    a.position.x += a.velocity.x * 0.08;
    b.position.x += b.velocity.x * 0.08;
    if (b.position.x - a.position.x <= 140) return { steps, line };
  }
  throw Error('winch failed to couple the ships');
}
const onlyWinch = simulatedReel(0);
const withTractor = simulatedReel(800);
assert(withTractor.steps < onlyWinch.steps, 'tractor must couple sooner than the winch alone');
assert(withTractor.line.tractorAssisted, 'tractor assistance must be reported');
assert(onlyWinch.steps > 5, 'winch should take multiple simulation steps');

const outOfRange = ship('attacker', 300, 400);
const farTarget = ship('defender', 900);
const noAssist = advanceCombatGrappleTether(attached, outOfRange, farTarget, 0.08);
assert(!noAssist.tractorAssisted, 'distant tractor cannot assist the winch');

const missed = fireCombatGrapple(
  'attacker',
  sourcePoint,
  targetPoint,
  0,
  100,
  100,
  false,
  () => 0.99
);
assert(missed && !missed.success);
const noRope = advanceCombatGrappleTether(missed, outOfRange, farTarget, 0.08);
assert.equal(noRope, missed, 'failed hook must never create a connection');

function setup(id, tractorRangeMeters = 0) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 0,
    hullHp: 100,
    weapons: [],
    hitChance: 0.6,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 95,
    tractorRangeMeters,
  };
}

const arena = {
  width: 2200,
  height: 1300,
  attackerPosition: { x: 600, y: 650 },
  defenderPosition: { x: 1000, y: 650 },
};
for (const owner of ['attacker', 'defender']) {
  let coupled = false;
  for (let seed = 1; seed <= 20 && !coupled; seed += 1) {
    const combat = createStrategicCombatService(setup('player', 850), setup('npc'), seed, arena);
    if (!combat.fireGrapple(owner)) continue;
    let snap = combat.getSnapshot();
    if (!snap.grapple.success) continue;
    assert.equal(combat.fireGrapple(owner), false);
    let hadMotionWhileAttached = false;
    for (let n = 0; n < 350 && !snap.winner; n += 1) {
      snap = combat.tick(0.08);
      if (snap.grapple?.resolved && snap.attacker.speed > 0 && snap.defender.speed > 0) {
        hadMotionWhileAttached = true;
      }
    }
    assert(hadMotionWhileAttached, 'both ships should move during the attached phase');
    assert.equal(snap.boardingInitiator, owner, 'either side must be able to board');
    coupled = true;
  }
  assert(coupled, 'a successful grapple should dock for ' + owner);
}

console.log('PASS grapple tension, momentum, winch, tractor assistance and symmetric boarding');
