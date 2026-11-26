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
assert(quoted.distance > 1000, 'quote must include the physical route between orbital berths');
assert.equal(
  quoted.fuelExpense,
  Math.ceil(quoted.distance * npc.fuelUse * 0.025 * 10),
  'fuel expense must reflect actual orbital flight distance, including fuel already aboard'
);
assert(quoted.refuelCost > 0 && quoted.refuelCost <= 800, 'fuel purchases must stay within budget');
assert.equal(npc.fuel, 50, 'quoting travel cannot alter the tank');
assert.equal(npc.credits, 800, 'quoting travel cannot debit credits');
assert.equal(npc.travel, undefined, 'quoting travel cannot start a flight');

const { decisionTravelQuotes, evaluateNpcPurchaseVoyage } = load(
  'src/systems/economy/npc-operating-decisions.ts'
);

function assertDecisionQuoteReuse() {
  const live = { ...npc, credits: 1000000 };
  let calls = 0;
  const quote = (ship, destination, credits) => {
    calls++;
    return sector.quoteTravel(ship, destination, credits);
  };
  const direct = sector.quoteTravel(live, 'fuel-a', 0);
  assert(direct?.budgetIndependent, 'direct flight must be explicitly certified');
  assert.deepEqual(sector.quoteTravel(live, 'fuel-a', 500), direct);
  const scoped = decisionTravelQuotes(quote);
  const args = [live, 'fuel-a', 32, 10, 100, 400];
  const baseline = evaluateNpcPurchaseVoyage(...args, quote);
  const baselineCalls = calls;
  calls = 0;
  assert.deepEqual(evaluateNpcPurchaseVoyage(...args, scoped), baseline);
  assert(baseline);
  assert.equal(calls, 1);
  assert(baselineCalls > calls);
  assert.deepEqual(evaluateNpcPurchaseVoyage(...args, scoped), baseline);
  assert.equal(calls, 1);

  // Budget-dependent routes must preserve affordability and failed quotes.
  assert.equal(scoped(npc, 'destination', 400), null);
  assert.deepEqual(scoped(npc, 'destination', 800), quoted);
  const beforeRepeat = calls;
  assert.equal(scoped(npc, 'destination', 400), null);
  assert.deepEqual(scoped(npc, 'destination', 800), quoted);
  assert.equal(calls, beforeRepeat);

  // Hypothetical ships and fresh decisions must never inherit an old quote.
  const empty = { ...live, fuel: 0 };
  assert.equal(scoped(empty, 'fuel-a', 0), null);
  assert.equal(scoped(live, 'fuel-a', -1), null);
  live.fuel = 0;
  assert.equal(decisionTravelQuotes(quote)(live, 'fuel-a', 0), null);
  assert.equal(npc.fuel, 50);
}

assertDecisionQuoteReuse();

npc.hullHp = Math.floor(npc.hullMaxHp * 0.3);
npc.homePortId = 'fuel-a';
assert.equal(
  sector.requestTravel(npc, 'destination', 'Handelsroute'),
  false,
  'critically damaged NPC must not start an ordinary commercial route'
);
assert.equal(
  sector.requestTravel(npc, npc.homePortId, 'Notwendige Hüllenreparatur'),
  true,
  'critically damaged NPC must still be able to return to its home port'
);
assert.equal(npc.travel?.finalTargetId, 'fuel-a');

console.log('PASS NPC fuel route quote, liquidity and critical-damage homeward flight');

const field = {
  id: 'field',
  name: 'field',
  kind: 'asteroid-field',
  position: { x: 200, y: 0 },
  activities: { mine: true },
  dangerLevel: 0,
};
const stranded = createSectorNpcEconomyStates().find((ship) => ship.job === 'miner');
stranded.locationId = field.id;
stranded.fuel = 0;
stranded.fuelCapacity = 50;
stranded.fuelUse = 4;
stranded.credits = 5000;
const rescueWorld = { ...world, locations: [...world.locations, field] };
const rescue = createNpcSectorService(rescueWorld, [stranded]);
const quoteRescue = rescue.quoteTravel(stranded, 'origin');
assert(quoteRescue && quoteRescue.refuelCost >= 2000);
assert.equal(stranded.fuel, 0);
assert.equal(stranded.credits, 5000);
assert(rescue.requestTravel(stranded, 'origin'));
assert.equal(stranded.fuel, 50);
assert.equal(stranded.credits, 3000);
assert.equal(stranded.travel.finalTargetId, 'origin');
console.log('PASS NPC paid emergency departure from an unserviced field');
