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

const arenaField = generateMiningSpace('fleet-pirate-crossfaction', 78);
const all = createSectorNpcEconomyStates();
const pirates = [
  all.find((npc) => npc.id === 'pirate-01'),
  all.find((npc) => npc.id === 'pirate-02'),
  all.find((npc) => npc.id === 'pirate-06'),
];
assert(pirates.every(Boolean), 'two real career pirate factions are required');
for (const npc of pirates) {
  npc.locationId = arenaField.sourceLocationId;
  delete npc.travel;
  delete npc.combatMovement;
}
const traffic = new LocalPirateTraffic(arenaField.width, arenaField.height, arenaField.seed);
traffic.reconcile(pirates);
// Place the three already-arrived NPCs within the career interception radius.
const positions = [
  { x: 500, y: 500 },
  { x: 550, y: 580 },
  { x: 640, y: 535 },
];
pirates.forEach((npc, i) => traffic.syncCombatPose(npc.id, positions[i], 0));
const drone = new AsteroidSecurityDrone(
  arenaField.width,
  arenaField.height,
  arenaField.asteroids
);
drone.destroy();
const field = {
  locationId: arenaField.sourceLocationId,
  instance: arenaField,
  pirates: traffic,
  drone,
  miners: { ships: [] },
  combatWrecks: [],
};
const originalPirates = traffic;
const bridge = createFleetCareerFieldSecurityBridge(field, pirates);
assert.equal(bridge.participants.length, 3);
const fleet = createFleetCombatService(
  bridge.participants,
  miningFieldCombatArena(arenaField, { x: 0, y: 0 }),
  bridge.world
);
const result = fleet.tick(0.08);
const first = result.ships.find((ship) => ship.ship.id === pirates[0].id);
const second = result.ships.find((ship) => ship.ship.id === pirates[1].id);
const enemy = result.ships.find((ship) => ship.ship.id === pirates[2].id);
assert.equal(first.factionId, 'pirate-a');
assert.equal(second.factionId, 'pirate-a');
assert.equal(enemy.factionId, 'pirate-b');
assert.equal(first.targetId, enemy.ship.id, 'pirate A acquires real hostile pirate B');
assert.equal(second.targetId, enemy.ship.id, 'two pirates can join an existing fight');
assert(
  [first.ship.id, second.ship.id].includes(enemy.targetId),
  'pirate B can return fire against hostile A'
);
assert.equal(result.engagements.length, 1, 'both attacks combine into one fleet engagement');
assert.equal(result.engagements[0].kind, 'fleet');
assert.deepEqual(
  [...result.engagements[0].memberIds].sort(),
  pirates.map((npc) => npc.id).sort(),
  'an already fighting pirate remains eligible for another attacker'
);
assert.strictEqual(field.pirates, originalPirates, 'existing campaign traffic is the sole owner');
console.log('PASS career pirate A/B hostility and multiple attackers use one fleet encounter');
