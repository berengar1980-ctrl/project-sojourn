'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const sideTradeModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/npc-resource-side-trade.ts'
);
const npcModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/npc-economy-service.ts'
);
const simulationModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/economy-simulation-service.ts'
);

function createMarkets() {
  const markets = [
    {
      locationId: 'source',
      produces: new Set(),
      needs: new Set(),
      entries: {
        steel: { resourceId: 'steel', stock: 40, demand: 0.2, production: 0, price: 40 },
        ferrite: { resourceId: 'ferrite', stock: 80, demand: 0.2, production: 0, price: 30 },
        obscura: { resourceId: 'obscura', stock: 20, demand: 0.2, production: 0, price: 10 },
      },
    },
    {
      locationId: 'near-stop',
      produces: new Set(),
      needs: new Set(['steel', 'ferrite']),
      entries: {
        steel: { resourceId: 'steel', stock: 10, demand: 0.9, production: 0, price: 100 },
        ferrite: { resourceId: 'ferrite', stock: 10, demand: 0.9, production: 0, price: 80 },
        obscura: { resourceId: 'obscura', stock: 2, demand: 0.9, production: 0, price: 500 },
      },
    },
    {
      locationId: 'far-stop',
      produces: new Set(),
      needs: new Set(['steel']),
      entries: {
        steel: { resourceId: 'steel', stock: 5, demand: 0.9, production: 0, price: 1000 },
        ferrite: { resourceId: 'ferrite', stock: 5, demand: 0.8, production: 0, price: 90 },
        obscura: { resourceId: 'obscura', stock: 1, demand: 0.9, production: 0, price: 800 },
      },
    },
  ];

  return {
    markets,
    snapshot() {
      return markets;
    },
    getMarket(locationId) {
      return markets.find((market) => market.locationId === locationId) ?? null;
    },
    getEntry(locationId, resourceId) {
      return this.getMarket(locationId)?.entries[resourceId] ?? null;
    },
    recalculate(locationId, resourceId) {
      return this.getEntry(locationId, resourceId)?.price ?? null;
    },
  };
}

const resources = [
  {
    id: 'steel',
    name: 'Stahl',
    categoryId: 'industry',
    category: 'Industrie',
    basePrice: 40,
    legality: 'legal',
  },
  {
    id: 'ferrite',
    name: 'Ferriterz',
    categoryId: 'raw',
    category: 'Rohstoffe',
    basePrice: 30,
    legality: 'legal',
  },
  {
    id: 'obscura',
    name: 'Obscura',
    categoryId: 'contraband',
    category: 'Schmuggel',
    basePrice: 10,
    legality: 'illegal',
  },
];

const positions = {
  source: { x: 0, y: 0 },
  'near-stop': { x: 50, y: 5 },
  'far-stop': { x: 50, y: 100 },
  work: { x: 100, y: 0 },
};

function createMiner() {
  return {
    id: 'miner',
    role: 'miner',
    locationId: 'source',
    credits: 1000,
    cargoCapacity: 20,
    normalCargoCapacity: 5,
    cargo: {},
    workResourceIds: ['ferrite'],
    workLocationId: 'work',
  };
}

{
  const markets = createMarkets();
  const miner = createMiner();
  const plan = sideTradeModule.findNpcResourceSideTrade(miner, 'work', {
    markets: markets.markets,
    resources,
    positions,
  });

  assert(plan, 'resource worker should find a profitable bounded side trade');
  assert.equal(plan.workLocationId, 'work');
  assert.equal(plan.tradeLocationId, 'near-stop');
  assert.equal(plan.resourceId, 'steel');
  assert.equal(plan.quantity, 5, 'side trade must use only the normal cargo hold');
  assert(plan.quantity < miner.cargoCapacity, 'specialist capacity must remain unavailable');
  assert(plan.extraDistance <= plan.allowedExtraDistance);
  assert(plan.expectedProfit > 0);
}

{
  const markets = createMarkets();
  markets.markets[1].entries.steel.price = 42;
  markets.markets[1].entries.ferrite.price = 31;
  const plan = sideTradeModule.findNpcResourceSideTrade(createMiner(), 'work', {
    markets: markets.markets,
    resources,
    positions,
  });
  assert.equal(plan, null, 'far lucrative market outside the detour envelope must be rejected');
}

{
  const markets = createMarkets();
  const miner = createMiner();
  const player = { credits: 0, cargo: {} };
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    player,
    resources,
    51,
    [miner]
  );
  const service = npcModule.createNpcEconomyService(markets, simulation, resources, [miner], {
    positions,
  });
  const steelBefore = simulation.getResourceTotal('steel');

  service.advanceDay(0);

  assert.equal(miner.locationId, 'near-stop');
  assert(miner.sideTradePlan, 'purchase must create an explicit side-trade plan');
  assert.equal(miner.sideTradePlan.workLocationId, 'work');
  assert.equal(miner.cargo.steel, 5);
  assert.equal(markets.markets[0].entries.steel.stock, 35);
  assert.equal(miner.cargo.obscura, undefined, 'ordinary side trade must reject illegal cargo');
  assert.equal(simulation.getResourceTotal('steel'), steelBefore);

  const creditsAfterPurchase = miner.credits;
  service.advanceDay(1);

  assert.equal(miner.locationId, 'work', 'worker must resume the fixed work destination');
  assert.equal(miner.sideTradePlan, undefined);
  assert.equal(miner.cargo.steel, undefined);
  assert.equal(markets.markets[1].entries.steel.stock, 15);
  assert(miner.credits > creditsAfterPurchase);
  assert.equal(simulation.getResourceTotal('steel'), steelBefore);

  const ferriteBefore = simulation.getResourceTotal('ferrite');
  service.advanceDay(2);

  assert.equal(miner.locationId, 'work');
  assert.equal(miner.cargo.ferrite, 8, 'worker must begin resource work after the trade stop');
  assert.equal(simulation.getResourceTotal('ferrite'), ferriteBefore);
}

console.log('PASS bounded NPC resource side trade and work resumption');
