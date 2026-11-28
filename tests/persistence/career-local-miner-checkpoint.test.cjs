'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { stageLocalMinerCheckpoint } = load('src/systems/npcs/npc-local-mining-checkpoint.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');

const miner = createSectorNpcEconomyStates().find((npc) => npc.job === 'miner');
assert(miner);
miner.locationId = 'greyrock-belt';
miner.workLocationId = 'greyrock-belt';
miner.autonomy = {
  phase: 'working',
  secondsRemaining: 0,
  lastLocationId: 'greyrock-belt',
  wasTravelling: false,
};
const asteroid = {
  id: 'rock-1',
  kind: 'resource',
  position: { x: 1000, y: 800 },
  radius: 90,
  routeBlocking: false,
  deposits: [{ resourceId: 'ferrite', oreRemaining: 80, oreCapacity: 80 }],
};
const copy = (value) => JSON.parse(JSON.stringify(value));
const optionsFor = (npc, rock) => ({
  locationId: 'greyrock-belt',
  seed: 77,
  width: 3000,
  height: 2000,
  miners: [npc],
  getAsteroids: () => [rock],
  mine: (actor, resourceId, quantity) => {
    const amount = Math.min(quantity, rock.deposits[0].oreRemaining);
    actor.cargo[resourceId] = (actor.cargo[resourceId] || 0) + amount;
    return amount;
  },
  depart: () => true,
});
const original = createNpcLocalMiningService(optionsFor(miner, asteroid));
assert.equal(original.ships.length, 1);
const ship = original.ships[0];
original.syncCombatPose(miner.id, { x: 640, y: 720 }, 0.4, { x: -18, y: 31 });
assert.deepEqual(ship.velocity, { x: -18, y: 31 }, 'combat returns preserve miner lateral drift');
const driftCheckpoint = original.exportState();
const driftRestored = createNpcLocalMiningService(
  optionsFor(copy(miner), copy(asteroid)),
  driftCheckpoint
);
assert.deepEqual(copy(driftRestored.ships[0].velocity), { x: -18, y: 31 });
ship.position = { x: asteroid.position.x + asteroid.radius + 48, y: asteroid.position.y };
ship.phase = 'scanning';
ship.targetAsteroidId = asteroid.id;
ship.scanProgress = 0.99;
original.tick(0.08);
assert.equal(ship.phase, 'mining');
const saved = original.exportState();
assert.equal(saved.events[0][1].draws, 7);
assert(saved.events[0][1].session);
const freshMiner = copy(miner);
const freshRock = copy(asteroid);
const restored = createNpcLocalMiningService(optionsFor(freshMiner, freshRock), saved);
assert.deepEqual(restored.exportState(), saved);
assert.notStrictEqual(restored.ships[0], original.ships[0]);
for (let i = 0; i < 40; i += 1) {
  original.tick(0.08);
  restored.tick(0.08);
}
assert.deepEqual(restored.exportState(), original.exportState());
assert.deepEqual(freshMiner.cargo, miner.cargo);
assert.deepEqual(freshRock.deposits, asteroid.deposits);
assert.equal(saved.ships[0].scanProgress, 1, 'Saved state must remain detached');
const invalid = copy(saved);
invalid.ships[0].targetAsteroidId = 'missing-asteroid';
assert.throws(() => stageLocalMinerCheckpoint(invalid, optionsFor(freshMiner, freshRock)));
const duplicate = copy(saved);
duplicate.ships.push(duplicate.ships[0]);
assert.throws(() => stageLocalMinerCheckpoint(duplicate, optionsFor(freshMiner, freshRock)));
const corruptedEvent = copy(saved);
corruptedEvent.events[0][1].draws = -1;
assert.throws(() => stageLocalMinerCheckpoint(corruptedEvent, optionsFor(freshMiner, freshRock)));
const wrongSeed = copy(saved);
wrongSeed.seed = 99;
assert.throws(() => stageLocalMinerCheckpoint(wrongSeed, optionsFor(freshMiner, freshRock)));
console.log('PASS local miner checkpoint: work cycle and event RNG resume');
