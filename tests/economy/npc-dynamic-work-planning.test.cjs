'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { chooseNpcWorksite } = load('src/systems/economy/npc-work-planning.ts');
const { chooseWorkerAction } = load('src/systems/economy/npc-trade-actions.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { captureCareerNpcs, stageCareerNpcs } = load(
  'src/systems/persistence/career-npc-checkpoint.ts'
);

const resources = [
  { id: 'ferrite', basePrice: 100, legality: 'legal' },
  { id: 'cuprium', basePrice: 400, legality: 'legal' },
];
const a = 'greyrock-belt';
const b = 'copper-crown-field';
const positions = {
  haven: { x: 0, y: 0 },
  [a]: { x: 100, y: 0 },
  [b]: { x: 100, y: 0 },
};
const sites = [
  { id: a, role: 'miner', position: positions[a], danger: 1, resourceIds: ['ferrite'] },
  { id: b, role: 'miner', position: positions[b], danger: 1, resourceIds: ['cuprium'] },
  { id: 'drift-wreck', role: 'salvager', position: positions[b], danger: 1, resourceIds: ['cuprium'] },
];
const quote = () => ({ distance: 100, refuelCost: 0, fuelExpense: 25 });

const npc = createSectorNpcEconomyStates().find((entry) => entry.job === 'miner');
assert(npc);
npc.locationId = 'haven';
npc.cargo = {};
npc.credits = 1000000;
delete npc.workLocationId;
npc.workResourceIds = [];
const markets = {
  snapshot: () => [],
  getMarket: () => null,
  getEntry: () => null,
  recalculate() {},
};
const allocator = { createMinedResource: () => 0, allocatePhysicalResource: () => 0 };
const economy = createNpcEconomyService(markets, allocator, resources, [npc], { positions });
const planning = { sites, fleet: [npc] };
economy.setWorkPlanning(planning);
assert.equal(chooseNpcWorksite(npc, planning, resources, positions, quote).site.id, b);
const onlyA = (_npc, destination) => (destination === a ? quote() : null);
assert.equal(chooseNpcWorksite(npc, planning, resources, positions, onlyA).site.id, a);
chooseWorkerAction(npc, markets, resources, positions, 0, quote, planning);
assert.equal(npc.workLocationId, b);
assert.deepEqual(npc.workResourceIds, ['cuprium']);
assert.equal(npc.autonomy.pendingDestinationId, b);

// An empty work cycle must also release its order and select another field.
assert(economy.dispatchLoadedWorker(npc));
assert.equal(npc.workLocationId, undefined);
assert.equal(npc.lastWorkLocationId, b);
chooseWorkerAction(npc, markets, resources, positions, 1, quote, planning);
assert.equal(npc.workLocationId, a);
assert.equal(npc.autonomy.pendingDestinationId, a);

const saved = captureCareerNpcs(narrowsSector, [npc]);
const restored = stageCareerNpcs(narrowsSector, JSON.parse(JSON.stringify(saved)))[0];
assert.equal(restored.workLocationId, a);
assert.equal(restored.lastWorkLocationId, b);

// A mobile miner must be accepted by a new physical field without a new NPC.
npc.locationId = a;
npc.autonomy.phase = 'working';
const optionsFor = (id) => ({
  locationId: id,
  seed: 41,
  width: 3000,
  height: 2000,
  miners: [npc],
  dynamicRoster: true,
  getAsteroids: () => [],
  mine: () => 0,
  depart: (worker) => economy.dispatchLoadedWorker(worker),
});
const first = createNpcLocalMiningService(optionsFor(a));
const second = createNpcLocalMiningService(optionsFor(b));
assert.equal(first.ships.length, 1);
assert.equal(second.ships.length, 0);
assert(economy.dispatchLoadedWorker(npc));
npc.workLocationId = b;
npc.locationId = b;
npc.autonomy.phase = 'working';
first.tick(0.0625);
second.tick(0.0625);
assert.equal(first.ships.length, 0);
assert.equal(second.ships.length, 1);
assert.equal(second.ships[0].npcId, npc.id);
console.log('PASS dynamic worker profit ranking, empty departure, mobile roster and save/load');

const { knownWorkPrice } = load('src/systems/economy/npc-work-planning.ts');
const { npcMarketConfidence, observeNpcMarket } = load(
  'src/systems/economy/npc-market-knowledge.ts'
);
delete npc.lastWorkLocationId;
npc.locationId = 'haven';
npc.marketIntel = {
  haven: {
    locationId: 'haven',
    observedDay: 42,
    entries: { ferrite: { resourceId: 'ferrite', stock: 100, price: 200 } },
  },
  crown: {
    locationId: 'crown',
    observedDay: 0,
    entries: { cuprium: { resourceId: 'cuprium', stock: 100, price: 400 } },
  },
};
assert.equal(npcMarketConfidence(42, 42), 1);
assert.equal(npcMarketConfidence(28, 42), 0.5);
assert.equal(npcMarketConfidence(0, 42), 0.25);
assert.equal(npcMarketConfidence(0, 365), 0.25);
const oldIntel = JSON.stringify(npc.marketIntel);
assert.equal(knownWorkPrice(npc, 'cuprium', resources, 42), 100);
assert.equal(chooseNpcWorksite(npc, planning, resources, positions, quote, 42).site.id, a);
assert.equal(JSON.stringify(npc.marketIntel), oldIntel);
const crown = {
  locationId: 'crown',
  entries: { cuprium: { resourceId: 'cuprium', stock: 90, price: 400 } },
};
assert(observeNpcMarket(npc, { getMarket: () => crown }, 'crown', 42));
assert.equal(knownWorkPrice(npc, 'cuprium', resources, 42), 400);
assert.equal(chooseNpcWorksite(npc, planning, resources, positions, quote, 42).site.id, b);
console.log('PASS old work prices lose influence and a fresh observation restores it');
