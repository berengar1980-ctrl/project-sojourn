'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);

const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { LocalPirateTraffic } = load('src/systems/npcs/npc-local-pirate-service.ts');
const { AsteroidSecurityDrone } = load('src/systems/operations/asteroid-security-drone.ts');
const { createFleetCareerFieldSecurityBridge } = load(
  'src/systems/combat/fleet-career-field-security-bridge.ts'
);
const { createFleetCombatService } = load('src/systems/combat/fleet-combat-service.ts');
const { miningFieldCombatArena } = load('src/systems/combat/field-combat-arena.ts');

const fieldInstance = generateMiningSpace('fleet-native-security-field', 92);
const locationId = fieldInstance.sourceLocationId;
const npcs = createSectorNpcEconomyStates();
const pirates = npcs.filter((npc) => npc.pirate).slice(0, 2);
const patrol = npcs.find((npc) => npc.job === 'patrol' && !npc.pirate);
assert(pirates.length === 2 && patrol);
for (const npc of pirates) {
  npc.locationId = locationId;
  delete npc.travel;
  delete npc.combatMovement;
}
const droneNpc = { ...patrol, id: 'security-drone:' + locationId, locationId };
const traffic = new LocalPirateTraffic(
  fieldInstance.width,
  fieldInstance.height,
  fieldInstance.seed
);
const drone = new AsteroidSecurityDrone(
  fieldInstance.width,
  fieldInstance.height,
  fieldInstance.asteroids
);
const miners = { ships: [] };
const field = {
  locationId,
  instance: fieldInstance,
  pirates: traffic,
  drone,
  miners,
  combatWrecks: [],
};
const bridge = createFleetCareerFieldSecurityBridge(field, [...pirates, droneNpc]);
assert.equal(bridge.participants.length, 3);
assert.deepEqual(
  bridge.participants
    .filter((p) => p.factionId.startsWith('pirate'))
    .map((p) => p.setup.id)
    .sort(),
  pirates.map((npc) => npc.id).sort()
);
assert.equal(bridge.participants.find((p) => p.factionId === 'security').setup.id, droneNpc.id);
assert.equal(field.pirates, traffic, 'the native career pirate traffic is retained');
assert.equal(field.drone, drone, 'the native career patrol drone is retained');
const before = traffic.snapshot(pirates)[0];
assert(before);
const near = {
  x: Math.min(fieldInstance.width - 30, before.position.x + 100),
  y: before.position.y,
};
miners.ships.push({ npcId: 'miner-test', position: near });
let trafficTicks = 0;
const originalTick = traffic.tick.bind(traffic);
traffic.tick = (...args) => {
  trafficTicks++;
  return originalTick(...args);
};
bridge.world.tickWorld(0.08);
assert.equal(trafficTicks, 1, 'one native pirate traffic step for the field');
const first = bridge.participants.find((p) => p.setup.id === before.npcId);
assert.equal(first.externalMovement(0.08, []).targetId, 'miner-test');
const contactAfter = traffic.snapshot(pirates).find((item) => item.npcId === before.npcId);
assert.deepEqual(first.externalMovement(0.08, []).position, contactAfter.position);

const fleet = createFleetCombatService(
  bridge.participants,
  miningFieldCombatArena(fieldInstance, { x: 0, y: 0 }),
  bridge.world
);
const snapshot = fleet.tick(0.08);
assert.equal(snapshot.ships.length, 3);
assert.equal(trafficTicks, 2, 'shared fleet ticks the existing pirate service once');
assert.equal(snapshot.ships.find((p) => p.ship.id === droneNpc.id).factionId, 'security');
assert.deepEqual(
  snapshot.ships.find((p) => p.ship.id === droneNpc.id).ship.position,
  drone.snapshot().position,
  'fleet drone pose always comes from the campaign drone authority'
);
assert.equal(
  createFleetCareerFieldSecurityBridge(field, [...pirates, droneNpc], new Set([droneNpc.id]))
    .participants.length,
  2,
  'an externally-owned security drone is never duplicated'
);
console.log('PASS native career pirate traffic and drone in shared FleetCombat world');
