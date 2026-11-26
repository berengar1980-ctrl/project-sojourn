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

{
  const markets = createMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    resources,
    95
  );
  const before = simulation.getResourceTotal('ferrite');
  const source = JSON.stringify(['greyrock-belt', 'initial-rock']);
  const marketBefore = markets.markets[0].entries.ferrite.stock;
  assert.equal(simulation.registerInitialPhysicalStock('ferrite', source, 40), 40);
  assert.equal(simulation.getResourceTotal('ferrite'), before + 40);
  assert.equal(simulation.pools.ferrite.target, before + 40);
  assert.equal(simulation.registerInitialPhysicalStock('ferrite', source, 100), 40);
  assert.equal(simulation.getResourceTotal('ferrite'), before + 40);
  assert.equal(markets.markets[0].entries.ferrite.stock, marketBefore);
  assert.equal(simulation.withdrawPhysicalStock('ferrite', source, 40), 40);
  assert.equal(simulation.registerInitialPhysicalStock('ferrite', source, 40), 0);
  assert.equal(simulation.getPhysicalStock('ferrite', source), 0);
}

{
  const markets = createMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    resources,
    96
  );
  const { balanceAsteroidStocks } = loadStandaloneTypeScriptModule(
    root,
    'src/app/game-controller-asteroid-stocks.ts'
  );
  const source = JSON.stringify(['greyrock-belt', 'rock']);
  simulation.registerInitialPhysicalStock('ferrite', source, 20);
  const deposit = { resourceId: 'ferrite', oreRemaining: 12, oreCapacity: 20 };
  const field = {
    sourceLocationId: 'greyrock-belt',
    asteroids: [{ id: 'rock', deposits: [deposit] }],
    chunks: [{ sourceAsteroidId: 'rock', resourceId: 'ferrite', amount: 5 }],
  };
  balanceAsteroidStocks(simulation, field, () => true);
  assert.equal(simulation.getPhysicalStock('ferrite', source), 17);
  assert.equal(simulation.pools.ferrite.recordedLosses, 3);
  assert.equal(deposit.oreRemaining, 12);
  field.chunks.length = 0;
  simulation.pools.ferrite.reserve = 4;
  markets.markets[0].entries.ferrite.stock -= 4;
  balanceAsteroidStocks(simulation, field, () => false);
  assert.equal(simulation.pools.ferrite.recordedLosses, 8);
  assert.equal(deposit.oreRemaining, 12);
  const total = simulation.getResourceTotal('ferrite');
  balanceAsteroidStocks(simulation, field, () => true);
  assert.equal(deposit.oreRemaining, 16);
  assert.equal(simulation.getPhysicalStock('ferrite', source), 16);
  assert.equal(simulation.pools.ferrite.reserve, 0);
  assert.equal(simulation.getResourceTotal('ferrite'), total);
}

{
  const markets = createMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    resources,
    97
  );
  const { createSalvageEconomyService } = loadStandaloneTypeScriptModule(
    root,
    'src/systems/economy/salvage-economy-service.ts'
  );
  const salvage = createSalvageEconomyService(simulation, trade);
  const deposit = { resourceId: 'ferrite', initialAmount: 12, remainingAmount: 12 };
  const field = {
    id: 'sector-event-field-salvage-special-test',
    wrecks: [{ id: 'event-wreck-test', resources: [deposit] }],
  };
  const source = JSON.stringify([field.id, field.wrecks[0].id]);
  simulation.pools.ferrite.reserve = 8;
  markets.markets[0].entries.ferrite.stock -= 8;
  const total = simulation.getResourceTotal('ferrite');
  salvage.prepareEventField(field);
  assert.equal(deposit.remainingAmount, 8);
  assert.equal(simulation.pools.ferrite.reserve, 0);
  assert.equal(simulation.getPhysicalStock('ferrite', source), 8);
  const recovered = salvage.recover('ferrite', 3, 20, 'event', source);
  assert.equal(recovered, 3);
  deposit.remainingAmount -= recovered;
  salvage.prepareEventField(field);
  assert.equal(deposit.remainingAmount, 5);
  assert.equal(simulation.getPhysicalStock('ferrite', source), 5);
  simulation.releasePhysicalStock(source);
  assert.equal(simulation.pools.ferrite.reserve, 5);
  assert.equal(simulation.getResourceTotal('ferrite'), total);

  const empty = { resourceId: 'ferrite', initialAmount: 20, remainingAmount: 20 };
  const emptyField = { id: 'event-empty', wrecks: [{ id: 'empty', resources: [empty] }] };
  const emptySource = JSON.stringify([emptyField.id, 'empty']);
  simulation.fundPhysicalStock('ferrite', 'other', 5);
  salvage.prepareEventField(emptyField);
  assert.equal(empty.remainingAmount, 0);
  assert.equal(simulation.getPhysicalStock('ferrite', emptySource), 0);
  assert.equal(salvage.recover('ferrite', 1, 20, 'event', emptySource), 0);
  assert.equal(simulation.getResourceTotal('ferrite'), total);
}

{
  const { combatBufferTarget, supplyDailyCombatBuffer, dailyProductionBudget } =
    loadStandaloneTypeScriptModule(root, 'src/systems/economy/physical-reserve-policy.ts');
  const pool = {
    target: 1000,
    reserve: 100,
    externalImports: 0,
    recordedLosses: 0,
    physicalStocks: { '["field","wreck"]': 10 },
  };
  assert.equal(combatBufferTarget('steel'), 145);
  assert.equal(combatBufferTarget('machine-parts'), 60);
  assert.equal(combatBufferTarget('composite-plate'), 45);
  assert.equal(combatBufferTarget('ferrite'), 0);
  assert.equal(supplyDailyCombatBuffer('steel', pool), 20);
  assert.equal(pool.reserve, 80);
  assert.equal(pool.combatBuffer, 20);
  assert.equal(dailyProductionBudget(pool), 52);
  assert.equal(supplyDailyCombatBuffer('ferrite', pool), 0);
  pool.combatBuffer = 140;
  const total = pool.reserve + pool.combatBuffer;
  assert.equal(supplyDailyCombatBuffer('steel', pool), 5);
  assert.equal(supplyDailyCombatBuffer('steel', pool), 0);
  assert.equal(pool.reserve + pool.combatBuffer, total);
  assert.equal(pool.target, 1000);
  assert.equal(pool.externalImports, 0);
  assert.equal(
    dailyProductionBudget({
      ...pool,
      physicalStocks: { '["sector-event-field-test","wreck"]': 10 },
    }),
    pool.reserve
  );
}

{
  const markets = createMarkets();
  for (const market of markets.markets) {
    market.entries.steel = { ...market.entries.ferrite, resourceId: 'steel', stock: 0 };
    delete market.entries.ferrite;
    if (market.produces.delete('ferrite')) market.produces.add('steel');
    if (market.needs.delete('ferrite')) market.needs.add('steel');
  }
  markets.markets[0].entries.steel.stock = 100;
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const definitions = [{ ...resources[0], id: 'steel' }];
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    definitions,
    98
  );
  const source = JSON.stringify(['field', 'wreck']);
  simulation.registerInitialPhysicalStock('steel', source, 10);
  markets.markets[0].entries.steel.stock = 0;
  simulation.pools.steel.reserve = 100;
  const total = simulation.getResourceTotal('steel');
  simulation.advanceDay(0);
  assert.equal(simulation.pools.steel.combatBuffer, 20);
  assert(simulation.pools.steel.reserve >= 28);
  assert(markets.markets[1].entries.steel.stock > 0);
  assert.equal(simulation.getResourceTotal('steel'), total);
  assert.equal(simulation.fundPhysicalStock('steel', 'combat-wreck-test', 15, true), 15);
  assert.equal(simulation.pools.steel.combatBuffer, 5);
  simulation.releasePhysicalStock('combat-wreck-test');
  assert.equal(simulation.getResourceTotal('steel'), total);
  simulation.advanceDay(1);
  assert(simulation.pools.steel.combatBuffer > 5);
  assert.equal(simulation.getResourceTotal('steel'), total);
  const checkpoint = simulation.exportState();
  const restored = simulationModule.createEconomySimulationService(
    markets,
    trade.player,
    definitions,
    98,
    [],
    checkpoint
  );
  assert.deepEqual(restored.exportState(), checkpoint);
  restored.advanceDay(1);
  assert.deepEqual(restored.exportState(), checkpoint);
}
