'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const simulationModule = load('src/systems/economy/economy-simulation-service.ts');

const markets = createEconomyMarketService(sectorPorts, economyResources);
const player = { credits: 0, cargo: {} };
const simulation = simulationModule.createEconomySimulationService(
  markets,
  player,
  economyResources,
  41
);

function moveToReserve(locationId, resourceId, amount) {
  const entry = markets.getEntry(locationId, resourceId);
  assert(entry && entry.stock >= amount);
  entry.stock -= amount;
  simulation.pools[resourceId].reserve += amount;
}

const asteroid = JSON.stringify(['greyrock-belt', 'asteroid-test']);
const wreck = JSON.stringify(['test-salvage-1', 'wreck-test']);
simulation.registerInitialPhysicalStock('ferrite', asteroid, 10);
simulation.registerInitialPhysicalStock('steel', wreck, 10);
moveToReserve('haven', 'medical', 1000);
moveToReserve('haven', 'ferrite', 100);
moveToReserve('haven', 'steel', 100);

const medicineProducer = markets.getEntry('haven', 'medical');
const medicineBefore = medicineProducer.stock;
simulation.advanceDay(0);
assert(medicineProducer.stock - medicineBefore > 16, 'production must exceed the old fixed cap');
assert(simulation.pools.medical.reserve <= 950, 'old surplus returns progressively');
assert(simulation.pools.ferrite.reserve >= 100, 'raw ore is not produced by markets');
assert(simulation.pools.steel.combatBuffer >= 20);
assert(simulation.pools.steel.reserve >= 28, 'shared production leaves reserve for wrecks');
assert.equal(simulation.fundPhysicalStock('ferrite', asteroid, 5), 5);
assert.equal(simulation.fundPhysicalStock('steel', wreck, 5), 5);
assert.equal(simulation.getPhysicalStock('ferrite', asteroid), 15);
assert.equal(simulation.getPhysicalStock('steel', wreck), 15);

for (const day of [89, 179, 364]) {
  simulation.advanceDay(day);
  for (const row of simulation.getResourceBalance()) {
    assert.equal(row.discrepancy, 0, row.resourceId + ' conservation');
    assert.equal(row.externalImports, 0, row.resourceId + ' no artificial replenishment');
  }
  assert(simulation.pools.medical.reserve <= 15, 'production-only reserve must not accumulate');
  assert(simulation.pools['spare-parts'].reserve <= 15);
  assert(simulation.pools.tools.reserve <= 15);
  console.log('PASS adaptive production and material conservation at day ' + (day + 1));
}
assert(simulation.pools.ferrite.reserve > 0);
assert.equal(simulation.getPhysicalStock('ferrite', asteroid), 15);
assert.equal(simulation.getPhysicalStock('steel', wreck), 15);
