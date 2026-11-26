'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { observeNpcMarket } = load('src/systems/economy/npc-market-knowledge.ts');
const tradeActions = load('src/systems/economy/npc-trade-actions.ts');
const { chooseWorkerAction, chooseTraderAction } = tradeActions;

for (const role of ['miner', 'salvager']) {
  const npc = createSectorNpcEconomyStates().find((entry) => entry.job === role);
  assert(npc);
  const markets = createEconomyMarketService(sectorPorts, economyResources);
  const port = npc.homePortId;
  const allocator = {
    createMinedResource: () => 0,
    allocatePhysicalResource: () => 0,
  };
  const economy = createNpcEconomyService(markets, allocator, economyResources, [npc]);
  npc.locationId = npc.workLocationId;
  npc.marketIntel = {};
  markets.getEntry(port, 'ferrite').price = 100000;
  observeNpcMarket(npc, markets, port, 0);
  npc.cargo = { ferrite: 4, steel: 3 };
  assert(npc.cargoCapacity > 7);
  assert(economy.dispatchLoadedWorker(npc));
  chooseWorkerAction(npc, markets, economyResources, {}, 0);
  assert.equal(npc.autonomy.pendingDestinationId, port);
  assert.equal(npc.autonomy.phase, 'launch-prep');

  npc.locationId = port;
  npc.autonomy.lastLocationId = port;
  const originalStock = markets.getEntry(port, 'ferrite').stock;
  chooseWorkerAction(npc, markets, economyResources, {}, 0);
  assert.equal(npc.autonomy.phase, 'unloading');
  assert.equal(npc.autonomy.pendingSaleResourceId, 'ferrite');
  economy.advanceDay(0);
  for (let i = 0; i < 60; i++) economy.tick(0.25);
  assert.equal(npc.cargo.ferrite, undefined);
  assert.equal(markets.getEntry(port, 'ferrite').stock, originalStock + 4);
  chooseWorkerAction(npc, markets, economyResources, {}, 0);
  assert.equal(npc.autonomy.pendingSaleResourceId, 'steel');
  assert.equal(npc.autonomy.phase, 'unloading');
}
console.log('PASS partial and mixed worker cargo is sold before starting another extraction trip');

for (const role of ['miner', 'salvager', 'freighter', 'patrol']) {
  const npc = createSectorNpcEconomyStates().find((entry) => entry.job === role);
  assert(npc);
  const markets = createEconomyMarketService(sectorPorts, economyResources);
  const allocator = { createMinedResource: () => 0, allocatePhysicalResource: () => 0 };
  const service = createNpcEconomyService(markets, allocator, economyResources, [npc]);
  npc.cargo = { ferrite: 10, steel: 1 };
  npc.locationId = 'haven';
  npc.marketIntel = {
    haven: {
      locationId: 'haven',
      observedDay: 0,
      entries: {
        ferrite: { resourceId: 'ferrite', stock: 0, price: 1 },
        steel: { resourceId: 'steel', stock: 0, price: 10000 },
      },
    },
  };
  npc.autonomy.phase = 'ready';
  npc.autonomy.lastLocationId = npc.locationId;
  if (role === 'freighter') chooseTraderAction(npc, markets, economyResources, {}, 0);
  else if (role === 'patrol') service.tick(0.25);
  else chooseWorkerAction(npc, markets, economyResources, {}, 0);
  assert.equal(npc.autonomy.phase, 'unloading', role);
  assert.equal(npc.autonomy.pendingSaleResourceId, 'steel', role);
}
console.log('PASS all four civilian roles compare sale value across mixed cargo');
