'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (p) => loadStandaloneTypeScriptModule(root, p);
const { LocalPirateTraffic } = load('src/systems/npcs/npc-local-pirate-service.ts');
const { getShipDefinition } = load('src/systems/ships/index.ts');

const shipId = 'miner-80m-variant-01';
const definition = getShipDefinition(shipId);
assert(definition, 'ship collision must use the native hull definition');
const npc = (id, extras = {}) => ({
  id,
  pirate: true,
  hullHp: 100,
  shipId,
  ...extras,
});
function traffic(npcs, coordinates) {
  return LocalPirateTraffic.fromCheckpoint(1600, 1200, 44, npcs, {
    version: 1,
    width: 1600,
    height: 1200,
    seed: 44,
    ships: coordinates.map(([id, x, y]) => ({
      npcId: id,
      position: { x, y },
      headingRadians: 0,
      speed: 80,
      awaitingCombat: false,
      routeState: { target: { x: 1300, y: 800 }, points: [{ x: 1300, y: 800 }], index: 0 },
    })),
    combatReturns: [],
  });
}
const playerNpc = [npc('pirate-a')];
const playerTraffic = traffic(playerNpc, [['pirate-a', 300, 300]]);
const player = { position: { x: 306, y: 300 }, headingRadians: 0 };
const playerContacts = playerTraffic.resolveShipContacts(playerNpc, [
  { id: 'player', ship: definition, state: player, pushWeight: 2.4 },
]);
assert(
  playerContacts.some((contact) => contact.firstId === 'pirate-a' && contact.secondId === 'player')
);
assert(player.position.x > 306, 'player cannot be a ghost through pirate shields');
assert(playerTraffic.snapshot(playerNpc)[0].position.x < 300, 'pirate is physically repelled');
assert(
  !playerTraffic.exportState().ships[0].routeState,
  'a displaced pirate must recalculate its route'
);

const civilianTraffic = traffic(playerNpc, [['pirate-a', 450, 350]]);
const miner = { position: { x: 455, y: 350 }, headingRadians: 0 };
const drone = { position: { x: 455, y: 350 }, headingRadians: 0 };
const npcContacts = civilianTraffic.resolveShipContacts(playerNpc, [
  { id: 'miner-one', ship: definition, state: miner, pushWeight: 1 },
  { id: 'drone-one', ship: definition, state: drone, pushWeight: 100000 },
]);
assert(npcContacts.some((contact) => contact.secondId === 'miner-one'));
assert(npcContacts.some((contact) => contact.secondId === 'drone-one'));
assert.notDeepEqual(miner.position, { x: 455, y: 350 }, 'NPC miner must have solid shields');

const multiple = [npc('pirate-a'), npc('pirate-b')];
const pirateTraffic = traffic(multiple, [
  ['pirate-a', 600, 500],
  ['pirate-b', 601, 500],
]);
const pirateContacts = pirateTraffic.resolveShipContacts(multiple, []);
assert(
  pirateContacts.some(
    (contact) => contact.firstId === 'pirate-a' && contact.secondId === 'pirate-b'
  )
);
assert.notEqual(pirateTraffic.snapshot(multiple)[0].position.x, 600);

const idlePirate = traffic(playerNpc, [['pirate-a', 310, 300]]);
const debris = {
  id: 'small-rock',
  kind: 'debris',
  position: { x: 300, y: 300 },
  radius: 12,
  collisionRadius: 10,
  routeBlocking: false,
  physics: { velocity: { x: 0, y: 0 }, angularVelocity: 0 },
};
idlePirate.resolveShipContacts(playerNpc, [], [debris]);
assert.equal(
  idlePirate.body('pirate-a').position.x,
  310,
  'light debris must not push a pirate back'
);
assert(debris.position.x < 300 && debris.physics.velocity.x < 0);
const solid = {
  ...debris,
  id: 'solid',
  kind: 'resource',
  routeBlocking: true,
  position: { x: 300, y: 300 },
  radius: 45,
  collisionRadius: 35,
};
idlePirate.resolveShipContacts(playerNpc, [], [solid]);
assert(idlePirate.body('pirate-a').position.x >= 335, 'large rocks retain solid separation');

for (const pirate of [true, false]) {
  const roster = [npc('arrival', { pirate, job: pirate ? 'pirate' : 'patrol' })];
  const ships = traffic(roster, [['arrival', 240, 500]]);
  const target = { x: 1250, y: 500 };
  const fragment = {
    ...debris,
    position: { x: 425, y: 500 },
    physics: { velocity: { x: 0, y: 0 }, angularVelocity: 0 },
  };
  for (let step = 0; step < 180; step++) {
    ships.tick(0.08, roster, target, [], [fragment], () => false);
    ships.resolveShipContacts(roster, [], [fragment]);
  }
  assert(ships.body('arrival').position.x > 550, 'incoming traffic must pass the mini asteroid');
}
const inactive = [npc('pirate-a', { combatMovement: { targetId: 'miner' } })];
const inactiveTraffic = traffic([npc('pirate-a')], [['pirate-a', 300, 300]]);
const stationary = { position: { x: 300, y: 300 }, headingRadians: 0 };
assert.equal(
  inactiveTraffic.resolveShipContacts(inactive, [
    { id: 'player', ship: definition, state: stationary },
  ]).length,
  0,
  'PvP must own all ship collisions during a duel'
);
assert.deepEqual(stationary.position, { x: 300, y: 300 });

const distantTraffic = traffic(playerNpc, [['pirate-a', 1000, 1000]]);
const a = { position: { x: 250, y: 200 }, headingRadians: 0 };
const b = { position: { x: 250, y: 200 }, headingRadians: 0 };
distantTraffic.resolveShipContacts(playerNpc, [
  { id: 'miner-one', ship: definition, state: a },
  { id: 'player', ship: definition, state: b },
]);
assert.deepEqual(a.position, b.position, 'existing miner-player contacts must not run twice');

console.log(
  'PASS pirate shields collide with player, miners, patrols and other pirates outside combat'
);
