'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createParallelNativeDuels } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/parallel-native-duels.ts'
);
const { createCareerFleetEncounter } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/career-fleet-encounter.ts'
);
function setup(id) {
  return {
    id, name: id, shipId: 'patrol-60m-variant-01',
    shieldHp: 500, hullHp: 1000, weapons: [], hitChance: 0.75,
    dodgeChance: 0.1, damageMultiplier: 1, criticalChance: 0,
    cycleTimeMultiplier: 1, combatSpeed: 140,
  };
}
const arena = {
  width: 4200, height: 2600,
  attackerPosition: { x: 700, y: 800 }, defenderPosition: { x: 1120, y: 820 },
  attackerHeadingRadians: 0.9, defenderHeadingRadians: -1.1,
  attackerVelocity: { x: 23, y: -10 }, defenderVelocity: { x: -35, y: 12 },
  asteroids: [], obstacles: [],
};
const a = { id: 'a', team: 'a', setup: setup('a') };
const b = { id: 'b', team: 'b', setup: setup('b') };
const fleet = createParallelNativeDuels([a, b], arena, 2151);
assert.deepEqual(fleet.getActor('a').position, arena.attackerPosition);
assert.deepEqual(fleet.getActor('b').position, arena.defenderPosition);
assert.deepEqual(fleet.getActor('a').velocity, arena.attackerVelocity);
assert.deepEqual(fleet.getActor('b').velocity, arena.defenderVelocity);
assert.equal(fleet.getActor('a').headingRadians, arena.attackerHeadingRadians);
assert.equal(fleet.getActor('b').headingRadians, arena.defenderHeadingRadians);

const extraPose = { x: 1410, y: 1190 };
const extraVelocity = { x: 43, y: -7 };
assert.equal(fleet.addShip({
  id: 'c', team: 'a', setup: setup('c'),
  position: extraPose, velocity: extraVelocity, headingRadians: 2.15,
}), true);
assert.deepEqual(fleet.getActor('c').position, extraPose);
assert.deepEqual(fleet.getActor('c').velocity, extraVelocity);
assert.equal(fleet.getActor('c').headingRadians, 2.15);
assert.equal(new Set(['a', 'b', 'c'].map((id) => fleet.getActor(id))).size, 3);

// One native AI/physics owner per ship, even after introducing a new target.
for (const id of ['a', 'b', 'c']) fleet.getActor(id).tractorThrowCooldown = 2;
fleet.tick(0.08);
for (const id of ['a', 'b', 'c']) {
  assert(
    Math.abs(fleet.getActor(id).tractorThrowCooldown - 1.92) < 1e-9,
    id + ' must be advanced exactly once'
  );
}

// The campaign must publish the combat actor pose back to the very same
// SectorNpcState read by the existing navigation and other world services.
const enemy = {
  id: 'npc', name: 'NPC', job: 'patrol', shipId: 'patrol-60m-variant-01',
  pirate: false, aggression: 80, hullHp: 900, hullMaxHp: 900,
  installedComponents: { weapon: [] }, locationId: 'haven',
  cargo: {}, cargoCapacity: 100,
  combatMovement: {
    mode: 'engaged', targetKind: 'player', targetId: 'player',
    position: { x: 800, y: 800 }, headingRadians: 0, speed: 0,
  },
};
const worldPose = {
  positionOf: (npc) => npc.combatMovement.position,
  headingOf: (npc) => npc.combatMovement.headingRadians,
  playerPosition: { x: 700, y: 800 },
};
const career = createCareerFleetEncounter(setup('player'), enemy, [enemy], true, arena, worldPose);
assert.deepEqual(career.fleet.getActor('npc').position, arena.defenderPosition);
career.tick(0.08);
const realNpcActor = career.fleet.getActor('npc');
assert.equal(enemy.combatMovement.headingRadians, realNpcActor.headingRadians);
assert.equal(enemy.combatMovement.speed, realNpcActor.speed);
assert.equal(
  enemy.combatMovement.position.x - realNpcActor.position.x,
  800 - arena.defenderPosition.x,
  'the campaign holds the original world-space coordinate mapping without jumping'
);
console.log('PASS shared native 1v1/fleet/career positions, velocity, heading and single motion owner');
