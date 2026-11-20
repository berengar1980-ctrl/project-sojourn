'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (filename) => loadStandaloneTypeScriptModule(root, filename);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { createFleetCareerNpcParticipant } = load('src/systems/combat/fleet-career-npc-adapter.ts');
const { createFleetCombatForCareerField } = load('src/systems/combat/fleet-career-field-entry.ts');

const fieldInstance = generateMiningSpace('fleet-career-field-test', 77);
const locationId = fieldInstance.sourceLocationId;
const npcs = createSectorNpcEconomyStates();
const miner = npcs.find((npc) => npc.job === 'miner');
const pirates = npcs.filter((npc) => npc.job === 'pirate').slice(0, 2);
assert(miner && pirates.length === 2);
miner.locationId = locationId;
miner.workLocationId = locationId;
miner.autonomy = {
  phase: 'working',
  secondsRemaining: 0,
  lastLocationId: locationId,
  wasTravelling: false,
};
let ticks = 0;
const mining = createNpcLocalMiningService({
  locationId,
  seed: fieldInstance.seed,
  width: fieldInstance.width,
  height: fieldInstance.height,
  miners: [miner],
  getAsteroids: () => fieldInstance.asteroids,
  mine() {
    return 0;
  },
  depart() {
    return true;
  },
});
assert.equal(mining.ships.length, 1);
const originalTick = mining.tick;
mining.tick = (seconds) => {
  ticks++;
  originalTick(seconds);
};
const field = {
  locationId,
  instance: fieldInstance,
  miners: mining,
  combatWrecks: [],
};
const opponents = pirates.map((npc, i) =>
  createFleetCareerNpcParticipant(
    npc,
    { x: fieldInstance.width * 0.65, y: fieldInstance.height * (0.3 + i * 0.25) },
    { targetId: null }
  )
);
const fleet = createFleetCombatForCareerField(field, [miner], opponents);
const before = { ...mining.ships[0].position };
const state = fleet.tick(0.08);
assert.equal(ticks, 1, 'existing campaign field service ticks once, not once per participant');
assert.equal(state.ships.length, 3);
assert.deepEqual(
  state.ships.find((ship) => ship.ship.id === miner.id).ship.position,
  mining.ships[0].position
);
assert.equal(field.miners, mining, 'no replacement mining service was constructed');
assert.equal(field.instance, fieldInstance, 'no replacement asteroid field was constructed');
assert.equal(state.arena.width, fieldInstance.width);
assert.equal(state.arena.height, fieldInstance.height);
assert(state.arena.asteroids.length > 0);
assert.throws(
  () => createFleetCombatForCareerField(field, [miner], [opponents[0], opponents[0]]),
  /Duplicate external participant/
);
assert.throws(
  () => createFleetCombatForCareerField(field, [miner], [
    ...opponents,
    { ...opponents[0], setup: { ...opponents[0].setup, id: miner.id } },
  ]),
  /second combat movement owner/
);
assert(before && state, 'live career state is used');
console.log('PASS FleetCombat career field entry reuses native field and single mining tick');
