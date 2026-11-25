'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const simulationModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/economy-simulation-service.ts'
);
const tradeModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/player-trade-service.ts'
);
const miningModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/mining-economy-service.ts'
);

function createMarkets() {
  const markets = [
    {
      locationId: 'consumer',
      produces: new Set(),
      needs: new Set(['ferrite']),
      entries: {
        ferrite: { resourceId: 'ferrite', stock: 60, demand: 0.9, production: 0, price: 40 },
      },
    },
    {
      locationId: 'producer',
      produces: new Set(['ferrite']),
      needs: new Set(),
      entries: {
        ferrite: { resourceId: 'ferrite', stock: 40, demand: 0.2, production: 1, price: 30 },
      },
    },
  ];

  return {
    markets,
    snapshot() {
      return markets;
    },
    getEntry(locationId, resourceId) {
      return (
        markets.find((market) => market.locationId === locationId)?.entries[resourceId] ?? null
      );
    },
    recalculate(locationId, resourceId) {
      return this.getEntry(locationId, resourceId)?.price ?? null;
    },
  };
}

const resources = [
  {
    id: 'ferrite',
    name: 'Ferriterz',
    categoryId: 'raw',
    category: 'Rohstoffe',
    basePrice: 40,
    legality: 'legal',
  },
];

{
  const markets = createMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    resources,
    91
  );
  const mining = miningModule.createMiningEconomyService(simulation, trade);
  const before = simulation.getResourceTotal('ferrite');

  const received = mining.collect('ferrite', 6, 20, 'greyrock-belt');

  assert.equal(received, 6);
  assert.equal(trade.player.cargo.ferrite.qty, 6);
  assert.equal(
    trade.player.cargo.ferrite.totalCost,
    0,
    'mined cargo must enter at zero purchase cost'
  );
  assert.equal(trade.player.cargo.ferrite.lastOriginId, 'greyrock-belt');
  assert.equal(
    simulation.getResourceTotal('ferrite'),
    before,
    'mining must transfer existing physical resource instead of creating stock from nothing'
  );
}

{
  const markets = createMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    resources,
    92
  );
  const mining = miningModule.createMiningEconomyService(simulation, trade);

  assert.equal(mining.collect('ferrite', 6, 7, 'greyrock-belt'), 6);
  const beforeSecond = simulation.getResourceTotal('ferrite');
  assert.equal(mining.collect('ferrite', 6, 7, 'greyrock-belt'), 1);
  assert.equal(trade.player.cargo.ferrite.qty, 7);
  assert.equal(simulation.getResourceTotal('ferrite'), beforeSecond);
  assert.equal(
    mining.collect('ferrite', 6, 7, 'greyrock-belt'),
    0,
    'full cargo must not consume reserve or market stock'
  );
  assert.equal(simulation.getResourceTotal('ferrite'), beforeSecond);
}

{
  const markets = createMarkets();
  markets.markets[0].entries.ferrite.stock = 0;
  markets.markets[1].entries.ferrite.stock = 0;
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    resources,
    93
  );
  const mining = miningModule.createMiningEconomyService(simulation, trade);

  assert.equal(mining.collect('ferrite', 6, 20, 'greyrock-belt'), 0);
  assert.equal(trade.player.cargo.ferrite, undefined);
}

const controllerSource = require('fs').readFileSync(
  path.join(root, 'src/app/game-controller-mining.ts'),
  'utf8'
);
const usesLocationEconomy = controllerSource.includes(
  'asteroidId ? JSON.stringify([location.id, asteroidId]) : undefined'
);
const usesLocationDeposits = controllerSource.includes(
  'generateMiningSpace(location.id, seed, location.minedResourceIds)'
);
assert(
  usesLocationEconomy && usesLocationDeposits,
  'every mining location must route local deposits through the shared economy bridge'
);

console.log('PASS reserve-backed mining, cargo capacity and physical conservation');

{
  const markets = createMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    resources,
    94
  );
  const mining = miningModule.createMiningEconomyService(simulation, trade);
  const source = JSON.stringify(['greyrock-belt', 'asteroid-1']);
  const pool = simulation.pools.ferrite;
  pool.reserve = 12;
  markets.markets[0].entries.ferrite.stock -= 12;
  assert.equal(simulation.fundPhysicalStock('ferrite', source, 12), 12);
  const total = simulation.getResourceTotal('ferrite');
  const marketBefore = markets.markets[0].entries.ferrite.stock;
  assert.equal(mining.collect('ferrite', 6, 7, 'greyrock-belt', source), 6);
  assert.equal(mining.collect('ferrite', 6, 7, 'greyrock-belt', source), 1);
  assert.equal(simulation.getPhysicalStock('ferrite', source), 5);
  assert.equal(mining.collect('ferrite', 6, 7, 'greyrock-belt', source), 0);
  assert.equal(markets.markets[0].entries.ferrite.stock, marketBefore);
  assert.equal(simulation.getResourceTotal('ferrite'), total);
}
