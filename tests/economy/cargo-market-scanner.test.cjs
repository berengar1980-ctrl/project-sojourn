'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { scanCargoMarkets } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/cargo-market-scanner.ts'
);

const player = {
  credits: 0,
  cargo: {
    ferrite: { qty: 10, totalCost: 0 },
    silicite: { qty: 4, totalCost: 0 },
  },
};
const data = new Map([
  ['a|ferrite', { price: 100, observedDay: 2 }],
  ['a|silicite', { price: 50, observedDay: 3 }],
  ['b|ferrite', { price: 120, observedDay: 3 }],
  ['b|silicite', { price: 10, observedDay: 3 }],
  ['c|ferrite', { price: 200, observedDay: 3 }],
]);
const locations = [
  { id: 'a', name: 'Alpha', position: { x: 10, y: 0 }, activities: { trade: true } },
  { id: 'b', name: 'Beta', position: { x: 20, y: 0 }, activities: { trade: true } },
  { id: 'c', name: 'Gamma', position: { x: 30, y: 0 }, activities: { trade: true } },
  { id: 'field', name: 'Field', position: { x: 0, y: 0 }, activities: { trade: false } },
];
const run = () =>
  scanCargoMarkets({
    player,
    intel: { entry: (locationId, resourceId) => data.get(locationId + '|' + resourceId) ?? null },
    locations,
    origin: { x: 0, y: 0 },
    currentDay: 5,
  });

const result = run();
assert.equal(result.resources.length, 2);
assert.equal(
  result.resources[0].best.locationId,
  'c',
  'best single commodity ignores other cargo'
);
assert.equal(
  result.markets[0].locationId,
  'b',
  'full-cargo recommendation excludes incomplete quotes'
);
assert.equal(
  result.markets[0].revenue,
  1166,
  'quotes use the same 6% selling fee as player trade'
);
assert.equal(result.markets[0].coveredQuantity, 14);
assert.equal(result.markets.find((item) => item.locationId === 'c').coveredQuantity, 10);
assert.equal(result.markets.find((item) => item.locationId === 'a').observedDay, 2);
assert.equal(
  result.resources[1].markets.length,
  2,
  'individual commodity has all matching markets'
);
player.cargo = {};
assert.equal(run().resources.length, 0, 'empty holds do not generate recommendations');
console.log('PASS cargo market scanner ranks known individual and full-cargo markets');
