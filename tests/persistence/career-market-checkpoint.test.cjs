'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { captureCareerMarkets, stageCareerMarkets } = load(
  'src/systems/economy/career-market-checkpoint.ts'
);

const resources = [
  { id: 'ore', name: 'Ore', categoryId: 'raw', category: 'Raw', basePrice: 20, legality: 'legal' },
  {
    id: 'fuel',
    name: 'Fuel',
    categoryId: 'energy-chemistry',
    category: 'Energy',
    basePrice: 30,
    legality: 'legal',
  },
];
const port = (locationId) => ({
  locationId,
  subtitle: '',
  economy: '',
  population: '',
  security: 'low',
  shipyard: false,
  producedCommodityIds: ['ore'],
  neededCommodityIds: ['fuel'],
  commodities: [
    { id: 'ore', stock: 100, demand: 0.2, production: 0.8 },
    { id: 'fuel', stock: 200, demand: 0.9, production: 0.1 },
  ],
});
const ports = [port('a'), port('b')];
const copy = (value) => JSON.parse(JSON.stringify(value));
const live = createEconomyMarketService(ports, resources);
live.getEntry('a', 'ore').stock = 41;
live.getEntry('a', 'ore').demand = 0.77;
live.getEntry('a', 'ore').production = 0.32;
live.getEntry('a', 'ore').price = 83;
live.getEntry('b', 'fuel').stock = 0;
live.getEntry('b', 'fuel').price = 115;
const checkpoint = captureCareerMarkets(live);
const restored = stageCareerMarkets(checkpoint, ports, resources);
assert.deepEqual(captureCareerMarkets(restored), checkpoint);
assert.notStrictEqual(restored.getEntry('a', 'ore'), live.getEntry('a', 'ore'));
restored.getEntry('a', 'ore').stock = 0;
assert.equal(live.getEntry('a', 'ore').stock, 41);
assert.equal(checkpoint.markets[0].entries[0].stock, 41);

for (const modify of [
  (s) => {
    s.version = 2;
  },
  (s) => {
    s.markets.pop();
  },
  (s) => {
    s.markets.push(s.markets[0]);
  },
  (s) => {
    s.markets[0].locationId = 'unknown';
  },
  (s) => {
    s.markets[0].entries.pop();
  },
  (s) => {
    s.markets[0].entries[0].resourceId = 'missing';
  },
  (s) => {
    s.markets[0].entries[1] = s.markets[0].entries[0];
  },
  (s) => {
    s.markets[0].entries[0].stock = -1;
  },
  (s) => {
    s.markets[0].entries[0].stock = Infinity;
  },
  (s) => {
    s.markets[0].entries[0].demand = 1.1;
  },
  (s) => {
    s.markets[0].entries[0].price = 0;
  },
]) {
  const invalid = copy(checkpoint);
  modify(invalid);
  assert.throws(() => stageCareerMarkets(invalid, ports, resources));
  assert.equal(live.getEntry('a', 'ore').stock, 41, 'Invalid restore must not mutate live markets');
}
console.log('PASS career market checkpoint: detached stock, price, and validation');
