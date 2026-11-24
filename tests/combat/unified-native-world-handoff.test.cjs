'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createParallelNativeDuels } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/parallel-native-duels.ts'
);
const { createCareerFleetEncounter } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/career-fleet-encounter.ts'
);
function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 500,
    hullHp: 1000,
    weapons: [],
    hitChance: 0.75,
    dodgeChance: 0.1,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 140,
  };
}
const arena = {
  width: 4200,
  height: 2600,
  attackerPosition: { x: 700, y: 800 },
  defenderPosition: { x: 1120, y: 820 },
  attackerHeadingRadians: 0.9,
  defenderHeadingRadians: -1.1,
  attackerVelocity: { x: 23, y: -10 },
  defenderVelocity: { x: -35, y: 12 },
  asteroids: [],
  obstacles: [],
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
assert.equal(
  fleet.addShip({
    id: 'c',
    team: 'a',
    setup: setup('c'),
    position: extraPose,
    velocity: extraVelocity,
    headingRadians: 2.15,
  }),
  true
);
assert.deepEqual(fleet.getActor('c').position, extraPose);
assert.deepEqual(fleet.getActor('c').velocity, extraVelocity);
assert.equal(fleet.getActor('c').headingRadians, 2.15);
assert.equal(new Set(['a', 'b', 'c'].map((id) => fleet.getActor(id))).size, 3);

const joining = createParallelNativeDuels([a, b], arena, 2152);
joining.getActor('a').position = { x: 2100, y: 780 };
joining.setBystanders([
  { id: 'nearby', shipId: a.setup.shipId, position: { x: 2070, y: 755 }, headingRadians: 0 },
]);
assert(joining.addShip({ id: 'arrival', team: 'b', setup: setup('arrival') }));
const arrival = joining.getActor('arrival');
assert(
  Math.hypot(arrival.position.x - 2100, arrival.position.y - 780) >= 95,
  'generated arrivals cannot spawn inside a live fighter'
);
assert(
  Math.hypot(arrival.position.x - 2070, arrival.position.y - 755) >= 95,
  'generated arrivals cannot spawn inside free traffic'
);
assert.equal(
  joining.addShip({
    id: 'outside',
    team: 'b',
    setup: setup('outside'),
    position: { x: -5, y: 20 },
  }),
  false
);

// One native AI/physics owner per ship, even after introducing a new target.
for (const id of ['a', 'b', 'c']) fleet.getActor(id).tractorThrowCooldown = 2;
fleet.tick(0.08);
for (const id of ['a', 'b', 'c']) {
  assert(
    Math.abs(fleet.getActor(id).tractorThrowCooldown - 1.92) < 1e-9,
    id + ' must be advanced exactly once'
  );
}

// Civilians are not target actors, but their world hulls must block the exact
// same native combat geometry. The collision response moves only the duelist.
const { shipContact } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ship-contact-geometry.ts'
);
const contactFleet = createParallelNativeDuels([a, b], arena, 2250);
const neutral = {
  id: 'neutral-freighter',
  shipId: 'patrol-60m-variant-01',
  position: { x: 710, y: 800 },
  headingRadians: 0,
};
contactFleet.setBystanders([neutral]);
assert.equal(contactFleet.getActor(neutral.id), null, 'neutral is not enlisted');
contactFleet.tick(0.08);
const collision = shipContact(contactFleet.getActor('a'), {
  ...neutral,
  setup: { shipId: neutral.shipId },
});
assert(
  collision.distance >= collision.required - 0.1,
  'shared native collision solver must keep ships from flying through neutral NPC hulls'
);
assert.equal(contactFleet.getActor(neutral.id), null, 'collision must not enlist neutral');
// The campaign must publish the combat actor pose back to the very same
// SectorNpcState read by the existing navigation and other world services.
const enemy = {
  id: 'npc',
  name: 'NPC',
  job: 'patrol',
  shipId: 'patrol-60m-variant-01',
  pirate: false,
  aggression: 80,
  hullHp: 900,
  hullMaxHp: 900,
  installedComponents: { weapon: [] },
  locationId: 'haven',
  cargo: {},
  cargoCapacity: 100,
  combatMovement: {
    mode: 'engaged',
    targetKind: 'player',
    targetId: 'player',
    position: { x: 800, y: 800 },
    headingRadians: 0,
    speed: 0,
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
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { createStarMapEngagementService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/star-map-engagement-service.ts'
);
const checkpoint = career.combat.exportCareerState();
const reconstruct = () =>
  createStrategicCombatService(
    setup('player'),
    realNpcActor.setup,
    checkpoint.seed,
    arena,
    checkpoint
  );
const reference = reconstruct();
const restored = reconstruct();
const engagement = createStarMapEngagementService({
  navigation: { getSnapshot: () => ({ currentPosition: worldPose.playerPosition }) },
  sectorNpcs: {
    npcs: [enemy],
    livePosition: worldPose.positionOf,
    liveHeading: worldPose.headingOf,
  },
});
engagement.restorePlayerCareerCombat(restored, enemy.id);
const restoredFleet = engagement.activePlayerFleet();
assert(restoredFleet, 'loading a live duel must restore the fleet coordinator');
assert.strictEqual(restoredFleet.getActor(enemy.id), restored.getParallelActor('defender'));
assert.deepEqual(engagement.activePlayerCombat().getSnapshot(), reference.getSnapshot());
for (let step = 0; step < 10; step++) {
  engagement.tick(0.08);
  assert.deepEqual(engagement.activePlayerCombat().getSnapshot(), reference.tick(0.08));
}
// Normal campaign entry, the two-ship FleetCombat coordinator and
// the direct PvP service must agree with identical prepared inputs.
const freshEnemy = { ...enemy, combatMovement: undefined };
const fieldEngagements = createStarMapEngagementService({
  navigation: {
    getSnapshot: () => ({ currentPosition: worldPose.playerPosition }),
    stopPursuit() {},
  },
  sectorNpcs: {
    npcs: [freshEnemy],
    livePosition: () => arena.defenderPosition,
    liveHeading: () => arena.defenderHeadingRadians,
    markEngaged() {},
  },
  getPlayerCombatant: () => setup('player'),
  log() {},
});
assert(fieldEngagements.engageNpcInArena(freshEnemy.id, arena));
const fieldCombat = fieldEngagements.activePlayerCombat();
const [playerSetup, enemySetup] = ['attacker', 'defender'].map(
  (side) => fieldCombat.getParallelActor(side).setup
);
const seed = fieldCombat.exportCareerState().seed;
const direct = createStrategicCombatService(playerSetup, enemySetup, seed, arena);
const fleetReplay = createParallelNativeDuels(
  [
    { id: playerSetup.id, team: 'a', setup: playerSetup },
    { id: enemySetup.id, team: 'b', setup: enemySetup },
  ],
  arena,
  seed
);
for (let step = 0; step < 10; step++) {
  fieldEngagements.tick(0.08);
  assert.deepEqual(fleetReplay.tick(0.08).duels[0], direct.tick(0.08));
  assert.deepEqual(fieldCombat.getSnapshot(), direct.getSnapshot());
}
console.log(
  'PASS shared native 1v1/fleet/career positions, velocity, heading and single motion owner'
);
