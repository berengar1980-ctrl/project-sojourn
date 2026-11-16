'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createMarketIntelService } = load('src/systems/economy/market-intel-service.ts');

const markets = createEconomyMarketService(sectorPorts, economyResources);
const original = createMarketIntelService(markets);
const port = sectorPorts[0];
assert(port);
original.recordHistory(0);
original.observeLocation(port.locationId, 0);
const saved = original.exportState();
const restored = createMarketIntelService(markets, saved);
assert.deepEqual(restored.exportState(), saved);
const first = saved.intel[0];
assert(first);
assert.deepEqual(restored.entry(first.locationId, first.resourceId), first);

const marketEntry = markets.getEntry(first.locationId, first.resourceId);
assert(marketEntry);
marketEntry.price += 130;
restored.recordHistory(1);
assert.deepEqual(original.exportState(), saved, 'restored history is isolated from source');
restored.observeLocation(first.locationId, 1);
assert.equal(restored.entry(first.locationId, first.resourceId).price, marketEntry.price);
assert.equal(original.entry(first.locationId, first.resourceId).price, first.price);

assert.throws(
  () =>
    createMarketIntelService(markets, {
      ...saved,
      intel: [...saved.intel, saved.intel[0]],
    }),
  /Duplicate/
);
assert.throws(() =>
  createMarketIntelService(markets, {
    ...saved,
    intel: [{ ...first, locationId: 'unknown-port' }],
  })
);
assert.throws(() =>
  createMarketIntelService(markets, {
    ...saved,
    history: [
      {
        day: 0,
        locations: [
          {
            locationId: port.locationId,
            entries: [{ resourceId: first.resourceId, price: -1, stock: 0 }],
          },
        ],
      },
    ],
  })
);
console.log('PASS player market intel/history restore retains knowledge and rejects corrupt data');
