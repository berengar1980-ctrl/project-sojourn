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
const firstPort = sectorPorts[0];
const secondPort = sectorPorts[1];
assert(firstPort && secondPort);

const firstResource = Object.values(markets.getMarket(firstPort.locationId).entries)[0];
const secondResource = Object.values(markets.getMarket(secondPort.locationId).entries)[0];
assert(firstResource && secondResource);

const dayZeroPrice = firstResource.price;
intel.recordHistory(0);
assert.equal(intel.entries().length, 0, 'remote markets must no longer be known omnisciently');

intel.observeFromSensors(
  [{ locationId: firstPort.locationId, position: { x: 100, y: 0 } }],
  { x: 0, y: 0 },
  0,
  20,
  1
);
assert.equal(
  intel.entry(firstPort.locationId, firstResource.resourceId),
  null,
  'weak sensors must not fabricate historical intel before enough history exists'
);

firstResource.price += 111;
intel.recordHistory(1);
firstResource.price += 222;
intel.recordHistory(2);

intel.observeFromSensors(
  [{ locationId: firstPort.locationId, position: { x: 100, y: 0 } }],
  { x: 0, y: 0 },
  2,
  20,
  1
);
const stale = intel.entry(firstPort.locationId, firstResource.resourceId);
assert(stale);
assert.equal(stale.observedDay, 0, 'weak sensor intel must use the real older history day');
assert.equal(stale.price, dayZeroPrice, 'stale sensor intel must use the historical price');

intel.observeFromSensors(
  [{ locationId: firstPort.locationId, position: { x: 100, y: 0 } }],
  { x: 0, y: 0 },
  2,
  100,
  1
);
const fresh = intel.entry(firstPort.locationId, firstResource.resourceId);
assert(fresh);
assert.equal(fresh.observedDay, 2, 'elite nearby sensors should receive current market intel');
assert.equal(fresh.price, firstResource.price);

intel.observeFromSensors(
  [{ locationId: secondPort.locationId, position: { x: 5000, y: 0 } }],
  { x: 0, y: 0 },
  2,
  100,
  1
);
assert.equal(
  intel.entry(secondPort.locationId, secondResource.resourceId),
  null,
  'markets beyond sensor range must remain unknown'
);

secondResource.price += 333;
intel.observeLocation(secondPort.locationId, 4);
const visited = intel.entry(secondPort.locationId, secondResource.resourceId);
assert(visited);
assert.equal(visited.price, secondResource.price, 'visiting a market must reveal exact live data');
assert.equal(visited.observedDay, 4);

console.log('PASS sensor-ranged market intel uses real history, age and local refresh');
