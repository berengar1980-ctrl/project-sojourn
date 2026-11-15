'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createPlayerTradeService } = load('src/systems/economy/player-trade-service.ts');
const { captureCareerPlayer, stageCareerPlayer } = load(
  'src/systems/economy/career-player-checkpoint.ts'
);
const resources = [
  { id: 'ore', name: 'Ore', categoryId: 'raw', category: 'Raw', basePrice: 20, legality: 'legal' },
  { id: 'fuel', name: 'Fuel', categoryId: 'raw', category: 'Raw', basePrice: 30, legality: 'legal' },
];
const ports = [{
  locationId: 'a', subtitle: '', economy: '', population: '', security: 'low',
  shipyard: false, producedCommodityIds: ['ore'], neededCommodityIds: ['fuel'],
  commodities: [
    { id: 'ore', stock: 100, demand: 0.2, production: 0.8 },
    { id: 'fuel', stock: 200, demand: 0.9, production: 0.1 },
  ],
}];
const markets = createEconomyMarketService(ports, resources);
const live = createPlayerTradeService(markets, 1000);
assert.equal(live.buy('a', 'ore', 5, 20).quantity, 5);
live.player.cargo.ore.hiddenQty = 2;
live.player.reservedCargoTons = 3;
live.player.smugglingNormalPenalty = 1;
const snapshot = captureCareerPlayer(live.player);
const copy = (value) => JSON.parse(JSON.stringify(value));
const staged = stageCareerPlayer(snapshot, markets, resources);
assert.deepEqual(copy(captureCareerPlayer(staged.player)), copy(snapshot));
assert.notStrictEqual(staged.player.cargo.ore, live.player.cargo.ore);
staged.player.cargo.ore.qty = 3;
assert.equal(live.player.cargo.ore.qty, 5);
assert.equal(snapshot.cargo.ore.qty, 5);
assert.equal(staged.receiveCargo('fuel', 2, 20, 'a'), 2);
assert.equal(live.player.cargo.fuel, undefined);
for (const mutate of [
  (s) => { s.version = 2; },
  (s) => { s.credits = -1; },
  (s) => { s.credits = Infinity; },
  (s) => { s.reservedCargoTons = -1; },
  (s) => { s.smugglingNormalPenalty = 1.5; },
  (s) => { s.cargo.unknown = s.cargo.ore; },
  (s) => { s.cargo.ore.qty = -1; },
  (s) => { s.cargo.ore.hiddenQty = 6; },
  (s) => { s.cargo.ore.totalCost = NaN; },
  (s) => { s.cargo.ore.lastOriginId = 'missing'; },
  (s) => { s.cargo.ore.extra = true; },
]) {
  const invalid = copy(snapshot);
  mutate(invalid);
  assert.throws(() => stageCareerPlayer(invalid, markets, resources));
  assert.deepEqual(copy(captureCareerPlayer(live.player)), copy(snapshot));
}
console.log('PASS career player checkpoint: credits, cargo, hidden tons, isolated restore');
