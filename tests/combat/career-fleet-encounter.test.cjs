'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createCareerFleetEncounter, createNpcFleetEncounter } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/career-fleet-encounter.ts'
);

function npc(id, job, aggression = 80) {
  return {
    id,
    name: id,
    job,
    shipId: 'patrol-60m-variant-01',
    pirate: job === 'pirate',
    pirateMark: job === 'pirate' ? 'black-tide' : undefined,
    aggression,
    hullHp: 800,
    hullMaxHp: 800,
    installedComponents: { weapon: [] },
    locationId: 'haven',
    cargo: {},
    cargoCapacity: 50,
  };
}
const miner = npc('miner', 'miner', 20);
const drone = npc('security-drone:haven', 'patrol');
const pirate = npc('pirate-a', 'pirate');
const patrol = npc('patrol', 'patrol');
const ships = [miner, drone, pirate, patrol];
const player = {
  id: 'player',
  name: 'Player',
  shipId: 'patrol-60m-variant-01',
  hullHp: 800,
  shieldHp: 500,
  weapons: [],
  hitChance: 0.7,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  combatSpeed: 120,
  preferredTactic: 'fight',
};
const worldPosition = () => ({ x: 100, y: 100 });
const area = { width: 4200, height: 2600, obstacles: [], asteroids: [] };

// A player attacking a civilian attracts a drone; pirates may enter the
// same ongoing encounter with independent hostile relations.
const session = createCareerFleetEncounter(player, miner, ships, true, area);
const joined = [];
session.joinNearby({ x: 100, y: 100 }, ships, worldPosition, (target) => joined.push(target.id));
assert(joined.includes('security-drone:haven'));
assert(joined.includes('pirate-a'));
assert.equal(session.fleet.supporters.length >= 2, true);
assert.equal(session.fleet.getSnapshot().finished, false);
session.tick(0.08);
assert(session.combat.getSnapshot().elapsedSeconds > 0);
assert.equal(session.members.has('miner'), true);

// The primary duel may replace the player's attacker slot with a surviving NPC.
session.fleet.getActor('player').hullHp = 0;
session.tick(0.08);
assert.notEqual(session.fleet.duels[0].getSnapshot().attacker.id, 'player');
const lost = session.combat.getSnapshot();
assert.equal(lost.attacker.id, 'player');
assert.equal(lost.attacker.hullHp, 0);
assert.equal(lost.winner, 'defender');
assert.equal(lost.outcomeReason, 'destruction');
session.tick(0.08);
assert.deepEqual(session.combat.getSnapshot().attacker.position, lost.attacker.position);

// A sector neighbor can join an embedded fight only from its own visible field body.
let seen = false;
const physical = { position: { x: 2030, y: 1305 }, headingRadians: 1.1 };
const local = createCareerFleetEncounter(
  player,
  miner,
  ships,
  true,
  {
    ...area,
    attackerPosition: { x: 1900, y: 1300 },
    defenderPosition: { x: 2000, y: 1300 },
  },
  {
    positionOf: worldPosition,
    headingOf: () => 0,
    fieldWitness: (_, candidate) => (seen && candidate.id === drone.id ? physical : null),
  }
);
local.joinNearby(worldPosition(), ships, worldPosition);
assert.equal(local.fleet.getActor(drone.id), null);
seen = true;
local.joinNearby(worldPosition(), ships, worldPosition);
const actor = local.fleet.getActor(drone.id);
assert.deepEqual(actor.position, physical.position);
assert.equal(actor.headingRadians, physical.headingRadians);
actor.hullHp = 1;
for (let i = 0; i < 300; i++) {
  local.tick(0.08);
  assert.notEqual(actor.tactic, 'flee');
}
// A drone can enter the existing engagement and actually fire on a visible
// pirate while still outside the old close-contact interception distance.
const patrolDrone = {
  ...drone,
  installedComponents: { reactor: ['reactor3'], weapon: ['weapon-front-repeater-3'] },
};
const droneRoster = [pirate, miner, patrolDrone];
const dronePose = { position: { x: 1930, y: 1600 }, headingRadians: Math.PI / 2 };
let hasSensorContact = false;
const droneIntercept = createNpcFleetEncounter(
  pirate,
  miner,
  droneRoster,
  {
    ...area,
    backdropSeed: 17,
    attackerPosition: { x: 1930, y: 1300 },
    defenderPosition: { x: 2300, y: 1300 },
  },
  {
    positionOf: worldPosition,
    headingOf: () => 0,
    fieldWitness: () => (hasSensorContact ? dronePose : null),
  }
);
droneIntercept.joinNearby(worldPosition(), droneRoster, worldPosition);
assert.equal(droneIntercept.fleet.getActor(patrolDrone.id), null);
hasSensorContact = true;
droneIntercept.joinNearby(worldPosition(), droneRoster, worldPosition);
const interceptor = droneIntercept.fleet.getActor(patrolDrone.id);
assert(interceptor, 'sensor contact inside 300 m joins the ongoing combat');
for (let i = 0; i < 10; i++) droneIntercept.tick(0.08);
assert(
  interceptor.weaponTelemetry.some((weapon) => weapon.shotsFired > 0),
  'drone fires with clear line of sight'
);
// An incoming grapple from a single-driver reinforcement is still a
// campaign boarding encounter and freezes the shared field until resolved.
const { shipContact } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ship-contact-geometry.ts'
);
const playerSpot = { x: 1000, y: 1300 };
let incomingBoarding = null;
for (let attempt = 0; attempt < 20; attempt++) {
  const firstTarget = npc('board-decoy-' + attempt, 'pirate');
  const boarder = npc('boarder', 'pirate');
  const roster = [firstTarget, boarder];
  const encounter = createCareerFleetEncounter(
    player,
    firstTarget,
    roster,
    true,
    {
      ...area,
      attackerPosition: playerSpot,
      defenderPosition: { x: 3100, y: 1300 },
    },
    {
      positionOf: worldPosition,
      headingOf: () => 0,
      fieldWitness: () => ({ position: { x: 1100, y: 1300 }, headingRadians: 0 }),
    }
  );
  encounter.joinNearby(worldPosition(), roster, worldPosition);
  const support = encounter.fleet.supporters[0];
  const target = encounter.fleet.getActor('player');
  const attacker = encounter.fleet.getActor(boarder.id);
  assert.strictEqual(support.getParallelActor('defender'), target);
  target.shieldHp = 0;
  target.hullHp = 100;
  assert(support.fireGrapple('attacker'));
  if (!support.getSnapshot().grapple.success) continue;
  target.subsystems.engine = 0;
  attacker.subsystems.engine = 0;
  target.position = { ...playerSpot };
  const farX = playerSpot.x + 250;
  attacker.position = { x: farX, y: playerSpot.y };
  for (let step = 0; step < 9; step++) encounter.tick(0.08);
  assert(support.getSnapshot().grapple.resolved);
  const targetCorrection = target.position.x - playerSpot.x;
  const sourceCorrection = farX - attacker.position.x;
  assert(targetCorrection > 0, 'the reinforcement hook must pull the shared target');
  assert(Math.abs(targetCorrection - sourceCorrection) < 1e-9, 'the hook preserves the midpoint');
  for (let step = 0; step < 12 && !encounter.combat.getSnapshot().boardingInitiator; step++) {
    for (const participant of [target, attacker]) {
      participant.headingRadians = 0;
      participant.velocity = { x: 0, y: 0 };
      participant.velocity = { x: 0, y: 0 };
    }
    target.position = { ...playerSpot };
    attacker.position = { x: 1100, y: 1300 };
    attacker.position.x = playerSpot.x + shipContact(target, attacker).required + 1;
    encounter.tick(0.08);
  }
  incomingBoarding = { encounter, support, boarder };
  break;
}
assert(incomingBoarding, 'deterministic fixture must include a successful reinforcement grapple');
const { encounter: boarded, support: boardingService, boarder } = incomingBoarding;
const boardingView = boarded.combat.getSnapshot();
assert.equal(boardingView.attacker.id, 'player');
assert.equal(boardingView.defender.id, boarder.id);
assert.equal(boardingView.boardingInitiator, 'defender');
const beforeBoardingTick = boarded.fleet.duels[0].getSnapshot().elapsedSeconds;
boarded.tick(0.08);
assert.equal(boarded.fleet.duels[0].getSnapshot().elapsedSeconds, beforeBoardingTick);
assert(boarded.combat.resumeAfterBoarding());
assert.equal(boardingService.getSnapshot().boardingInitiator, null);
boarded.tick(0.08);
assert(boarded.fleet.duels[0].getSnapshot().elapsedSeconds > beforeBoardingTick);

// Background NPC fights share the very same coordinator. Nearby security
// and a capable patrol should oppose pirates without separate combat code.
const victim = npc('victim', 'freighter', 10);
const witnesses = [
  victim,
  npc('pirate-x', 'pirate'),
  npc('patrol-x', 'patrol'),
  npc('security-drone:x', 'patrol'),
];
const background = createNpcFleetEncounter(witnesses[1], victim, witnesses, area);
const joinedBackground = [];
background.joinNearby({ x: 100, y: 100 }, witnesses, worldPosition, (target) =>
  joinedBackground.push(target.id)
);
assert(joinedBackground.includes('patrol-x'));
assert(joinedBackground.includes('security-drone:x'));
background.tick(0.08);
assert.equal(background.fleet.getSnapshot().finished, false);
assert.equal(background.members.size, 4);
const { rivalPirateGroups } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-combat-ai.ts'
);
assert.equal(
  rivalPirateGroups(npc('a', 'pirate'), { ...npc('b', 'pirate'), pirateMark: 'broken-spear' }),
  true
);
assert.equal(rivalPirateGroups(npc('a', 'pirate'), npc('b', 'pirate')), false);
const newcomer = npc('late-pirate', 'pirate', 52);
const arrival = { x: 220, y: 200 };
const late = createCareerFleetEncounter(
  player,
  miner,
  [miner],
  true,
  { ...area, attackerPosition: { x: 200, y: 200 }, defenderPosition: { x: 2500, y: 1600 } },
  {
    positionOf: worldPosition,
    headingOf: () => 0,
    fieldWitness: () => ({ position: arrival, headingRadians: 1, speed: 71 }),
  }
);
late.joinNearby(worldPosition(), [newcomer], worldPosition);
late.joinNearby(worldPosition(), [newcomer], worldPosition);
assert.deepEqual(late.fleet.getActor(newcomer.id)?.position, arrival);
assert.deepEqual(late.fleet.getActor(newcomer.id).velocity, {
  x: Math.cos(1) * 71,
  y: Math.sin(1) * 71,
});
assert.equal(
  late.fleet.supporters.length,
  1,
  'a pirate arriving near the player joins once, far from the original defender'
);

const { liveFleetCombatView } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/parallel-native-duel-overlay.ts'
);
const red = npc('red-pirate', 'pirate');
const yellow = { ...npc('yellow-pirate', 'pirate'), pirateMark: 'broken-spear' };
const defeated = createCareerFleetEncounter(player, red, [red, yellow], true, {
  ...area,
  attackerPosition: { x: 1400, y: 1300 },
  defenderPosition: { x: 1600, y: 1300 },
});
defeated.joinNearby(worldPosition(), [yellow], worldPosition);
assert(defeated.fleet.getActor(yellow.id), 'rival joins after the fight started');
defeated.fleet.getActor(player.id).hullHp = 0;
defeated.tick(0.08);
const playerDefeat = defeated.combat.getSnapshot();
assert.equal(playerDefeat.winner, 'defender');
assert.equal(playerDefeat.defender.id, red.id);
const survivors = defeated.fleet.getSnapshot();
assert.equal(survivors.finished, false);
for (let frame = 0; frame < 8; frame++) defeated.tick(0.08);
const remaining = defeated.fleet.getSnapshot();
assert.deepEqual(defeated.combat.getSnapshot().defender.position, playerDefeat.defender.position);
const presented = liveFleetCombatView(playerDefeat, [...remaining.duels, ...remaining.supporters]);
assert.deepEqual(presented.defender.position, defeated.fleet.getActor(red.id).position);
assert.notDeepEqual(presented.defender.position, playerDefeat.defender.position);
assert.equal(presented.attacker, playerDefeat.attacker);
assert.equal(presented.winner, 'defender');

const { seededLocalGate } = loadStandaloneTypeScriptModule(root, 'src/core/local-space-exit.ts');
const fieldArena = { ...area, backdropSeed: 832 };
for (const seedPirate of [pirate, newcomer]) {
  const scenario = createNpcFleetEncounter(seedPirate, victim, [victim, seedPirate], fieldArena);
  assert.deepEqual(
    scenario.combat.getSnapshot().exitPoint,
    seededLocalGate(area.width, area.height, 832),
    'different encounters on one field must use the same marked exit'
  );
}
console.log('PASS campaign shared fleet sessions: player, NPC, pirates, patrols, drones join live');

// A sector-space fight must never recruit the field's stationary drone by global distance.
const strategic = createNpcFleetEncounter(pirate, miner, ships, undefined, {
  positionOf: worldPosition,
  headingOf: () => 0,
  fieldWitness: () => physical,
  fieldOwnsContact: (candidate) => candidate.id === drone.id,
});
strategic.joinNearby(worldPosition(), [drone], worldPosition);
assert.equal(strategic.fleet.getActor(drone.id), null);
