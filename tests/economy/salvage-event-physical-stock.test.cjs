'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load('src/systems/economy/economy-simulation-service.ts');
const { reconcileSalvageEventStock } = load('src/systems/economy/salvage-economy-service.ts');
const { salvageStockId } = load('src/systems/salvage/salvage-stock-id.ts');

const markets = createEconomyMarketService(sectorPorts, economyResources);
const player = { credits: 0, cargo: {} };
const physical = createEconomySimulationService(markets, player, economyResources, 71, []);
const wreck = {
  id: 'test-wreck',
  resources: [{ resourceId: 'steel', initialAmount: 10, remainingAmount: 10 }],
};
const field = { id: 'test-field', wrecks: [wreck] };
const source = salvageStockId(field, wreck);
physical.registerInitialPhysicalStock('steel', source, 10);
const lossBefore = physical.pools.steel.recordedLosses;
wreck.resources[0].remainingAmount = 6;
wreck.resources.push({ resourceId: 'electronics', initialAmount: 7, remainingAmount: 7 });
const result = {
  title: 'Test',
  resultText: 'Test',
  resourceLostTons: 4,
  resourceAddedTons: 7,
  bonusResourceId: 'electronics',
  componentDestroyed: false,
};
const reserveBefore = physical.pools.electronics.reserve;
const expected = Math.min(7, Math.floor(reserveBefore));
const actual = reconcileSalvageEventStock(physical, field, wreck, result);
assert.equal(physical.getPhysicalStock('steel', source), 6);
assert.equal(physical.pools.steel.recordedLosses, lossBefore + 4);
assert.equal(physical.getPhysicalStock('electronics', source), expected);
assert.equal(wreck.resources[1].remainingAmount, expected);
assert.equal(wreck.resources[1].initialAmount, expected);
assert.equal(actual.resourceAddedTons, expected);
assert.equal(physical.pools.electronics.reserve, reserveBefore - expected);
assert(physical.getResourceBalance().every((row) => row.discrepancy === 0));
const snapshot = physical.exportState();
reconcileSalvageEventStock(physical, field, wreck, actual);
assert.deepEqual(physical.exportState(), snapshot, 'repeated reconciliation is idempotent');
console.log('PASS physical salvage event discoveries and losses');
