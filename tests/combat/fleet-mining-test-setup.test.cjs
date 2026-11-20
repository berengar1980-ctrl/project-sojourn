'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (filename) => loadStandaloneTypeScriptModule(root, filename);
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { createFleetMiningTestSetup } = load('src/ui/start/fleet-mining-test-setup.ts');
const { createFleetCombatService } = load('src/systems/combat/fleet-combat-service.ts');
const { miningFieldCombatArena } = load('src/systems/combat/field-combat-arena.ts');

const field = generateMiningSpace('duel', 203, undefined, 'sparse');
const miners = [
  { id: 'miner-1', name: 'Real miner A', spawnAtSeconds: 0 },
  { id: 'miner-2', name: 'Real miner B', spawnAtSeconds: 2 },
];
const scenario = createFleetMiningTestSetup(miners, field);
assert.equal(scenario.participants.length, 2);
assert.equal(scenario.mining.ships.length, 1, 'only native initial miner has spawned');
assert.equal(scenario.participants[0].setup.aiControlled, true);
const player = {
  id: 'player', name: 'player', shipId: 'patrol-test',
  shieldHp: 100, hullHp: 100, weapons: [],
  hitChance: 0.6, dodgeChance: 0, damageMultiplier: 1,
  criticalChance: 0, cycleTimeMultiplier: 1,
};
const fleet = createFleetCombatService(
  [
    ...scenario.participants,
    { setup: player, factionId: 'player', position: { x: 300, y: 300 }, targetId: null },
  ],
  miningFieldCombatArena(field, { x: 0, y: 0 }),
  scenario.world
);
assert.equal(fleet.getSnapshot().pendingArrivals[0].id, 'miner-2');
for (let i = 0; i < 30; i++) fleet.tick(0.08);
assert.equal(scenario.mining.ships.length, 2, 'scheduled miner is introduced by real career service');
assert.equal(fleet.getSnapshot().pendingArrivals.length, 0);
assert.equal(fleet.getSnapshot().ships.length, 3);
const initialCargo = scenario.miners.reduce((sum, miner) =>
  sum + Object.values(miner.cargo).reduce((n, amount) => n + amount, 0), 0);
for (let i = 0; i < 460; i++) fleet.tick(0.08);
assert(scenario.mining.ships.some((ship) => ship.phase === 'mining' || ship.phase === 'scanning') ||
  scenario.miners.some((miner) => Object.values(miner.cargo).some((amount) => amount > 0)),
  'career miner should navigate and eventually scan or mine');
assert(scenario.miners.reduce((sum, miner) =>
  sum + Object.values(miner.cargo).reduce((n, amount) => n + amount, 0), 0) >= initialCargo);
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/fleet-test-lobby.ts'), 'utf8');
assert(lobby.includes('createFleetMiningTestSetup(') &&
  lobby.includes('generateMiningSpace(') &&
  lobby.includes('miningSetup?.world'),
  'PvP launcher must wire actual native campaign world, not an inert miner preview');
console.log('PASS PvP FleetCombat starts real campaign mining world, including delayed worker');
