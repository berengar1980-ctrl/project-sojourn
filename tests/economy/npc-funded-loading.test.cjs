'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const economy = load('src/systems/economy/npc-economy-service.ts');
const autonomy = load('src/systems/npcs/npc-autonomy.ts');

const resources = [
  {
    id: 'steel',
    name: 'Steel',
    categoryId: 'industry',
    category: 'Industry',
    basePrice: 100,
    legality: 'legal',
  },
];
const source = {
  locationId: 'source',
  entries: {
    steel: { resourceId: 'steel', price: 100, stock: 100, demand: 0.5, production: 0 },
  },
};
const destination = {
  locationId: 'destination',
  entries: {
    steel: { resourceId: 'steel', price: 160, stock: 10, demand: 0.8, production: 0 },
  },
};
const markets = {
  snapshot: () => [source, destination],
  getMarket: (id) => [source, destination].find((market) => market.locationId === id) ?? null,
  getEntry(id, resourceId) {
    return this.getMarket(id)?.entries[resourceId] ?? null;
  },
  recalculate: () => 100,
};
const allocator = {
  allocatePhysicalResource: () => 0,
  createMinedResource: () => 0,
};
const trader = {
  id: 'budgeted-trader',
  role: 'freighter',
  locationId: 'source',
  credits: 1000,
  cargoCapacity: 10,
  cargo: {},
  workResourceIds: [],
};
const service = economy.createNpcEconomyService(markets, allocator, resources, [trader], {
    positions: {
      source: { x: 0, y: 0 },
      destination: { x: 100, y: 0 },
    },
    travel: {
      requestTravel: () => true,
      isTravelling: () => false,
      quoteTravel: (_npc, _destination, availableCredits) =>
        availableCredits >= 200 ? { distance: 100, fuelExpense: 50, refuelCost: 200 } : null,
    },
});
trader.autonomy.pendingTrade = {
  resourceId: 'steel',
  destinationId: 'destination',
  quantity: 10,
  reason: 'Handelsroute',
};
autonomy.beginNpcAutonomyPhase(trader, 'loading', 0);
service.tick(0.25);
assert.equal(trader.cargo.steel, 8, 'cargo purchase must protect the paid tank-stop budget');
assert.equal(trader.credits, 200, 'credits earmarked for fuel must stay in wallet');
assert.equal(source.entries.steel.stock, 92, 'physical stock conservation remains intact');
assert.equal(trader.autonomy.pendingDestinationId, 'destination');
assert.equal(trader.autonomy.phase, 'launch-prep');

console.log('PASS NPC loads an affordable shipment without spending required travel funds');
