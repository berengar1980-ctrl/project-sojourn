'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { resourceBalanceReport } = load('src/systems/economy/resource-balance-report.ts');
const { createSmugglingService } = load('src/systems/economy/smuggling-service.ts');

const markets = [
  { entries: { steel: { stock: 20, price: 100 } } },
  { entries: { steel: { stock: 0, price: 300 } } },
  { entries: {} },
];
const player = { credits: 1000000, cargo: { steel: { qty: 5, totalCost: 0 } } };
const npcs = [{ cargo: { steel: 7 } }];
const pool = {
  target: 80,
  externalImports: 10,
  recordedLosses: 2,
  reserve: 9,
  combatBuffer: 4,
  physicalStocks: {
    '["greyrock-belt","asteroid-10-2"]': 11,
    '["ilex-salvage-9","wreck-9-1"]': 12,
    'combat-wreck-test': 8,
    '["sector-event-field-salvage-special-1-1","event-wreck-1"]': 6,
    'unknown-source': 6,
  },
};
const balance = () => resourceBalanceReport('steel', markets, player, npcs, pool);
assert.deepEqual(balance(), {
  resourceId: 'steel',
  target: 80,
  externalImports: 10,
  recordedLosses: 2,
  expectedTotal: 88,
  marketStock: 20,
  playerCargo: 5,
  npcCargo: 7,
  reserve: 9,
  combatBuffer: 4,
  asteroidStock: 11,
  salvageStock: 12,
  combatWreckStock: 8,
  eventWreckStock: 6,
  unclassifiedStock: 6,
  actualTotal: 88,
  discrepancy: 0,
  marketsWithResource: 2,
  emptyMarkets: 1,
  minPrice: 100,
  maxPrice: 300,
});
markets[0].entries.steel.stock += 3;
assert.equal(balance().discrepancy, 3, 'unexplained creation');
markets[0].entries.steel.stock -= 5;
assert.equal(balance().discrepancy, -2, 'unexplained loss');
pool.recordedLosses += 2;
assert.equal(balance().discrepancy, 0, 'explicit loss balances the accounting');
assert.equal(balance().discrepancy, 0, 'report itself must not mutate the pool');

const losses = [];
player.cargo.narcotics = { qty: 8, totalCost: 0 };
const customs = createSmugglingService(player, [], (id, amount) => losses.push([id, amount]));
assert(customs.startInspection('harbor', 'haven', 1));
const outcome = customs.decide('comply', 'test-ship', 100, () => 0);
assert.equal(outcome.outcome, 'seized');
assert.deepEqual(losses, [['narcotics', 8]]);
assert.equal(player.cargo.narcotics, undefined);
assert.equal(player.cargo.steel.qty, 5);
customs.decide('ack', 'test-ship', 100, () => 0);
assert.deepEqual(losses, [['narcotics', 8]]);
console.log('PASS resource ledger breakdown and one-time player confiscation accounting');
