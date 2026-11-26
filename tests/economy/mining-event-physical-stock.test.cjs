'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { applyMiningEventDepositEffects } = load('src/systems/local-space/mining-event-service.ts');
const { resolveMiningEventEffect } = load('src/systems/local-space/mining-event-outcomes.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');

const markets = createEconomyMarketService(sectorPorts, economyResources);
const player = { credits: 0, cargo: {} };
const simulation = createEconomySimulationService(markets, player, economyResources);
const location = 'greyrock-belt';
const instance = generateMiningSpace(location, 71, ['ferrite']);
const asteroid = instance.asteroids.find((rock) => rock.deposits.length > 0);
assert(asteroid);
const source = JSON.stringify([location, asteroid.id]);
const fund = (id, amount) => simulation.fundPhysicalStock(id, source, amount);
const effect = resolveMiningEventEffect('rare', 'careful', [0, 0, 0.99], 'ferrite');
assert.equal(effect.bonusResourceId, 'cyranthite');
assert(!asteroid.deposits.some((deposit) => deposit.resourceId === effect.bonusResourceId));

const id = effect.bonusResourceId;
const market = markets.getEntry('haven', id);
assert(market && market.stock >= 5);
market.stock -= 5;
simulation.pools[id].reserve += 5;
const total = simulation.getResourceTotal(id);
const result = applyMiningEventDepositEffects(asteroid, effect, fund);
assert.equal(result.bonusTons, 5);
assert.equal(simulation.getPhysicalStock(id, source), 5);
assert.equal(simulation.pools[id].reserve, 0);
assert.equal(applyMiningEventDepositEffects(asteroid, effect, fund).bonusTons, 0);
assert.equal(simulation.getResourceTotal(id), total);
const deposit = asteroid.deposits.find((entry) => entry.resourceId === id);
assert.equal(deposit.oreCapacity, 5);
assert.equal(deposit.oreRemaining, 5);

// A discovered resource survives a fresh field generation, even when depleted.
assert.equal(simulation.withdrawPhysicalStock(id, source, 5), 5);
deposit.oreRemaining -= 5;
market.stock += 5;
const claims = new AsteroidClaimRegistry();
claims.rememberField(location, instance.asteroids);
const restored = new AsteroidClaimRegistry();
assert(restored.restoreState(JSON.parse(JSON.stringify(claims.exportState()))));
const regenerated = generateMiningSpace(location, 71, ['ferrite']);
restored.restoreField(location, regenerated.asteroids);
const recoveredRock = regenerated.asteroids.find((rock) => rock.id === asteroid.id);
const recoveredDeposit = recoveredRock.deposits.find((entry) => entry.resourceId === id);
assert.equal(recoveredDeposit.oreCapacity, 5);
assert.equal(recoveredDeposit.oreRemaining, 0);
assert.equal(simulation.getPhysicalStock(id, source), 0);
assert.equal(simulation.getResourceTotal(id), total);
console.log('PASS mining-event bonus funding, exhausted reserve and discovered vein persistence');
