'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { economyResources } = loadStandaloneTypeScriptModule(
  root,
  'src/data/economy/economy-resources.ts'
);
const { sectorPorts } = loadStandaloneTypeScriptModule(root, 'src/data/ports/sector-ports.ts');
const { createEconomyMarketService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/market-service.ts'
);
const { createMarketIntelService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/market-intel-service.ts'
);

const markets = createEconomyMarketService(sectorPorts, economyResources);
const intel = createMarketIntelService(markets);
intel.observeAll(0);

assert(intel.entries().length > 0, 'system market must start with broad known market data');
const first = intel.entries()[0];
assert(first);
const oldPrice = first.price;
const live = markets.getEntry(first.locationId, first.resourceId);
assert(live);
live.price += 777;

assert.equal(
  intel.entry(first.locationId, first.resourceId).price,
  oldPrice,
  'remote market intel must remain stale when the live market changes'
);

intel.observeLocation(first.locationId, 4);
const refreshed = intel.entry(first.locationId, first.resourceId);
assert.equal(refreshed.price, live.price, 'visiting a market must refresh its known price');
assert.equal(refreshed.observedDay, 4, 'market intel must store the day it was observed');

const another = intel.entries().find((entry) => entry.locationId !== first.locationId);
assert(another);
assert.equal(
  another.observedDay,
  0,
  'unvisited markets must keep their old observation day and therefore age'
);

console.log('PASS broad market intel stays stale until a market is visited');
