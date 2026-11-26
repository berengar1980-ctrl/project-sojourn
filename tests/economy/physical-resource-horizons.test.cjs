'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { WreckClaimRegistry } = load('src/systems/operations/wreck-claim-registry.ts');
const { salvageStockId } = load('src/systems/salvage/salvage-stock-id.ts');
const { permanentSalvageField, balancePermanentSalvageStocks } = load(
  'src/app/game-controller-salvage-stocks.ts'
);
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { balanceAsteroidStocks } = load('src/app/game-controller-asteroid-stocks.ts');

const markets = createEconomyMarketService(sectorPorts, economyResources);
const ships = createSectorNpcEconomyStates();
const npc = ships.find((entry) => entry.job === 'salvager');
assert(npc);
const player = { credits: 0, cargo: {} };
let simulation = createEconomySimulationService(markets, player, economyResources, 71, ships);
let claims = new WreckClaimRegistry();
let npcs = createNpcEconomyService(markets, simulation, economyResources, ships);
let context = { economy: { simulation, wreckClaims: claims, npcs } };
const locations = narrowsSector.locations.filter((location) => location.activities.salvage);
const red = locations.filter((location) => location.dangerLevel === 3);
assert(red.length >= 2);
const definitions = new Map(economyResources.map((resource) => [resource.id, resource]));

for (const location of locations) {
  const field = permanentSalvageField(context, location);
  claims.rememberField(field);
  const resources = field.wrecks.flatMap((wreck) => wreck.resources);
  assert(resources.length > 0);
  assert(resources.every((deposit) => definitions.has(deposit.resourceId)));
  if (location.dangerLevel <= 1) {
    assert(resources.every((deposit) => definitions.get(deposit.resourceId).legality === 'legal'));
  }
  if (location.dangerLevel === 3) {
    assert(resources.some((deposit) => definitions.get(deposit.resourceId).legality === 'illegal'));
    assert(resources.every((deposit) => definitions.get(deposit.resourceId).basePrice >= 500));
  }
}

const miningLocation = narrowsSector.locations.find((location) => location.id === 'greyrock-belt');
assert(miningLocation);
const mining = generateMiningSpace(miningLocation.id, 71, miningLocation.minedResourceIds);
for (const asteroid of mining.asteroids) {
  const source = JSON.stringify([miningLocation.id, asteroid.id]);
  for (const deposit of asteroid.deposits) {
    assert(miningLocation.minedResourceIds.includes(deposit.resourceId));
    simulation.registerInitialPhysicalStock(deposit.resourceId, source, deposit.oreRemaining);
  }
}
const rock = mining.asteroids.find((asteroid) => asteroid.deposits.length > 0);
assert(rock);
const ore = rock.deposits[0];
const rockId = JSON.stringify([miningLocation.id, rock.id]);

function assertConservation() {
  for (const resource of economyResources) {
    const pool = simulation.pools[resource.id];
    assert.equal(
      simulation.getResourceTotal(resource.id),
      pool.target + pool.externalImports - pool.recordedLosses,
      resource.id + ' material conservation'
    );
  }
}

function returnNpcCargo() {
  // Scripted market settlement: this test isolates the physical ledger from route timing.
  for (const [id, amount] of Object.entries(npc.cargo)) {
    const market = markets.snapshot().find((entry) => entry.entries[id]);
    if (!market) continue;
    market.entries[id].stock += amount;
    delete npc.cargo[id];
  }
}

function checkField(field) {
  for (const wreck of field.wrecks) {
    for (const deposit of wreck.resources) {
      assert.equal(
        simulation.getPhysicalStock(deposit.resourceId, salvageStockId(field, wreck)),
        deposit.remainingAmount
      );
      assert(deposit.remainingAmount >= 0 && deposit.remainingAmount <= deposit.initialAmount);
    }
  }
}

let extracted = 0;
for (let day = 0; day < 365; day++) {
  simulation.advanceDay(day);
  const amount = simulation.withdrawPhysicalStock(ore.resourceId, rockId, 3);
  ore.oreRemaining -= amount;
  npc.cargo[ore.resourceId] = (npc.cargo[ore.resourceId] ?? 0) + amount;
  returnNpcCargo();
  const field = permanentSalvageField(context, red[0]);
  // Scripted extraction isolates conservation from the worker's travel and scan timing.
  const wreck = field.wrecks.find((entry) =>
    entry.resources.some((deposit) => deposit.remainingAmount > 0)
  );
  const deposit = wreck?.resources.find((entry) => entry.remainingAmount > 0);
  if (wreck && deposit) {
    const recovered = npcs.salvageLocal(
      npc, deposit.resourceId, Math.min(5, deposit.remainingAmount), salvageStockId(field, wreck)
    );
    deposit.remainingAmount -= recovered;
    extracted += recovered;
  }
  returnNpcCargo();
  for (const location of locations) {
    const current = permanentSalvageField(context, location);
    balancePermanentSalvageStocks(simulation, current, (id) => !claims.claim(current.id, id, day));
    claims.rememberField(current);
    checkField(current);
  }
  balanceAsteroidStocks(simulation, mining, () => true);
  assertConservation();

  if ([89, 179, 364].includes(day)) {
    const saved = simulation.exportState();
    const savedClaims = claims.exportState();
    simulation = createEconomySimulationService(
      markets,
      player,
      economyResources,
      71,
      ships,
      saved
    );
    claims = new WreckClaimRegistry();
    claims.restoreState(savedClaims);
    npcs = createNpcEconomyService(markets, simulation, economyResources, ships);
    context = { economy: { simulation, wreckClaims: claims, npcs } };
    for (const location of locations) {
      checkField(permanentSalvageField(context, location));
    }
    assert.deepEqual(simulation.exportState(), saved);
    assertConservation();
    const balance = simulation.getResourceBalance();
    assert(balance.every((row) => row.discrepancy === 0 && row.unclassifiedStock === 0));
    assert(balance.some((row) => row.asteroidStock > 0));
    assert(balance.some((row) => row.salvageStock > 0));
    console.log(JSON.stringify({ days: day + 1, physicalFields: true, resourceBalance: balance }));
    console.log('PASS physical resource circulation and reload at day ' + (day + 1));
  }
}
assert(extracted > 0, 'background salvager must actually recover physical material');
