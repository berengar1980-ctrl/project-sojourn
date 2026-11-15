'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { stageCareerResourcePools } = load(
  'src/systems/economy/career-resource-pool-checkpoint.ts'
);
const { captureCareerMarkets, stageCareerMarkets } = load(
  'src/systems/economy/career-market-checkpoint.ts'
);

const resources = [
  {
    id: 'ore',
    name: 'Ore',
    categoryId: 'raw',
    category: 'Raw',
    basePrice: 20,
    legality: 'legal',
  },
];
const ports = [
  {
    locationId: 'haven',
    subtitle: '',
    economy: '',
    population: '',
    security: 'low',
    shipyard: false,
    producedCommodityIds: [],
    neededCommodityIds: ['ore'],
    commodities: [{ id: 'ore', stock: 500, demand: 0.9, production: 0.2 }],
  },
];
const copy = (value) => JSON.parse(JSON.stringify(value));
const player = () => ({ credits: 1000, cargo: {} });
const originalMarkets = createEconomyMarketService(ports, resources);
const original = createEconomySimulationService(originalMarkets, player(), resources, 41);
original.advanceDay(5);
original.allocatePhysicalResource('ore', 8);
original.pools.ore.recordedLosses += 2;
const savedMarkets = captureCareerMarkets(originalMarkets);
const saved = original.exportState();
assert.equal(saved.lastDay, 5);
assert.equal(saved.physicalAllocationCounter, 1);
const freshMarkets = stageCareerMarkets(savedMarkets, ports, resources);
const restored = createEconomySimulationService(freshMarkets, player(), resources, 41, [], saved);
assert.deepEqual(restored.exportState(), saved);
assert.deepEqual(captureCareerMarkets(freshMarkets), savedMarkets);
restored.advanceDay(5);
assert.deepEqual(restored.exportState(), saved, 'The saved day must not run twice');
original.advanceDay(6);
restored.advanceDay(6);
assert.deepEqual(restored.exportState(), original.exportState());
assert.deepEqual(captureCareerMarkets(freshMarkets), captureCareerMarkets(originalMarkets));
original.allocatePhysicalResource('ore', 9);
restored.allocatePhysicalResource('ore', 9);
assert.deepEqual(restored.exportState(), original.exportState());
assert.deepEqual(captureCareerMarkets(freshMarkets), captureCareerMarkets(originalMarkets));
const savedReserve = saved.pools.ore.reserve;
restored.pools.ore.reserve += 23;
assert.notEqual(restored.pools.ore.reserve, original.pools.ore.reserve);
assert.equal(saved.pools.ore.reserve, savedReserve);

for (const change of [
  (state) => {
    state.version = 3;
  },
  (state) => {
    state.seed = 99;
  },
  (state) => {
    state.lastDay = -2;
  },
  (state) => {
    state.physicalAllocationCounter = -1;
  },
  (state) => {
    state.pools.ore.reserve = -1;
  },
  (state) => {
    state.pools.ore.externalImports = Infinity;
  },
  (state) => {
    state.pools.ore.target = 1.5;
  },
  (state) => {
    state.pools.extra = { ...state.pools.ore };
  },
  (state) => {
    delete state.pools.ore;
  },
]) {
  const invalid = copy(saved);
  change(invalid);
  assert.throws(() => stageCareerResourcePools(invalid, resources, 41));
}
console.log('PASS career resource pools: day resume, allocation sequence and validation');
