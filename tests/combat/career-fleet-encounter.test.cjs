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
console.log('PASS campaign shared fleet sessions: player, NPC, pirates, patrols, drones join live');
