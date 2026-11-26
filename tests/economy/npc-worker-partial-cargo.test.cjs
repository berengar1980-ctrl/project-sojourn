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
const { chooseWorkerAction } = load('src/systems/economy/npc-trade-actions.ts');

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
  observeNpcMarket(npc, markets, port, 0);
  npc.cargo = { ferrite: 4, steel: 3 };
  assert(npc.cargoCapacity > 7);
  assert(economy.dispatchLoadedWorker(npc));
  chooseWorkerAction(npc, markets, economyResources, {}, 0);
  assert.equal(npc.autonomy.pendingDestinationId, port);
  assert.equal(npc.autonomy.phase, 'launch-prep');

  npc.locationId = port;
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
