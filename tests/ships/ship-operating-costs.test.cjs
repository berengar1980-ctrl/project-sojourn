'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const operations = load('src/systems/ships/ship-operating-costs.ts');
const ships = load('src/systems/ships/ship-registry.ts');
const miner = ships.getShipsByRole('mining')[0];
const freighter = ships.getShipsByRole('freighter')[0];
assert(miner && freighter);

const player = { credits: 25 };
const wallet = {
  player,
  takeCredits(amount) {
    if (amount <= 0 || amount > player.credits) return false;
    player.credits -= amount;
    return true;
  },
};
const service = operations.createShipOperatingService(wallet);
assert.equal(service.snapshot(miner, 100).fuelCapacity, 145);
assert.equal(service.snapshot(miner, 100).hullHp, 100);
assert.equal(service.hasFuelForRoute(miner, 300), true);
assert.equal(service.hasFuelForRoute(miner, 100000), false);
assert.equal(operations.fuelForDistance(100, 1), 2.5);
assert.equal(operations.fuelForDistance(100, 1, 0.9, 0.9), 2.025);
assert.equal(operations.quoteRefuel(90, 100, 3).units, 0.3);
assert.equal(operations.quoteRefuel(90, 100, 3).cost, 3);
assert.equal(operations.quoteRefuel(90, 100, 0).cost, 0);

assert(Math.abs(service.burn(miner, 100) - 2.15) < 1e-9);
assert(Math.abs(service.snapshot(miner, 100).fuel - 142.85) < 1e-9);
const purchased = service.refuel(miner);
assert.equal(purchased.cost, 22);
assert.equal(player.credits, 3);
assert.equal(service.refuel(miner).cost, 0);
assert.equal(service.snapshot(freighter, 115).fuel, 150);

service.recordHull(miner, 80, 100);
assert.equal(service.snapshot(miner, 100).hullHp, 80);
assert.equal(service.snapshot(freighter, 115).hullHp, 115);
assert.equal(operations.repairCost(10, false, 1), 1000);
assert.equal(operations.repairCost(10, true, 1), 800);
assert.equal(operations.repairCost(10, true, 0.85), 680);
assert.equal(service.repair(miner, 100, true, 0.85).points, 0);

player.credits = 1000;
const repair = service.repair(miner, 100, true, 0.85);
assert.equal(repair.points, 14);
assert.equal(repair.cost, 952);
assert.equal(player.credits, 48);
assert.equal(service.snapshot(miner, 100).hullHp, 94);
player.credits = 500;
const finish = service.repair(miner, 100, true, 0.85);
assert.equal(finish.points, 6);
assert.equal(finish.cost, 408);
assert.equal(service.snapshot(miner, 100).hullHp, 100);
assert.equal(service.repair(miner, 100, false).cost, 0);

console.log('PASS ship fuel, tariffs, affordability, crew modifiers and hull persistence');
