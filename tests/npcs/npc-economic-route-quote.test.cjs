'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');

function station(id, x) {
  return {
    id,
    name: id,
    kind: 'station',
    position: { x, y: 0 },
    activities: { dock: true },
    dangerLevel: 0,
  };
}

const world = {
  id: 'npc-profit-quote',
  width: 1400,
  height: 400,
  locations: [
    station('origin', 0),
    station('fuel-a', 400),
    station('fuel-b', 800),
    station('destination', 1200),
  ],
  regions: [],
};
const npc = createSectorNpcEconomyStates().find((ship) => ship.job === 'freighter');
assert(npc);
npc.locationId = 'origin';
npc.fuel = 50;
npc.fuelCapacity = 50;
npc.fuelUse = 4;
npc.credits = 800;
const sector = createNpcSectorService(world, [npc]);
assert.deepEqual(sector.quoteTravel(npc, 'origin'), {
  distance: 0,
  refuelCost: 0,
  fuelExpense: 0,
});
assert.equal(sector.quoteTravel(npc, 'destination', 400), null);

const quoted = sector.quoteTravel(npc, 'destination', 800);
assert(quoted, 'a sufficiently funded multi-stop route must be offered');
assert.equal(quoted.distance, 1200);
assert.equal(quoted.fuelExpense, 1200, 'includes consumption of fuel already aboard');
assert.equal(quoted.refuelCost, 800, 'only fuel bought en route drains immediate liquidity');
assert.equal(npc.fuel, 50, 'quoting travel cannot alter the tank');
assert.equal(npc.credits, 800, 'quoting travel cannot debit credits');
assert.equal(npc.travel, undefined, 'quoting travel cannot start a flight');

console.log('PASS NPC fuel route quote is affordable and does not mutate credits or travel');
