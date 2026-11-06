'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load('src/systems/economy/economy-simulation-service.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { transferPirateLoot } = load('src/systems/combat/npc-combatant-setup.ts');

const DAYS = 90;
const STEPS_PER_DAY = 64;
const STEP_SECONDS = 0.25;
const npcs = createSectorNpcEconomyStates();
const markets = createEconomyMarketService(sectorPorts, economyResources);
const player = { credits: 0, cargo: {} };
const physical = createEconomySimulationService(markets, player, economyResources, 41, npcs);
const sector = createNpcSectorService(narrowsSector, npcs, { markets });
const positions = Object.fromEntries(
  narrowsSector.locations.map((location) => [location.id, location.position])
);
const economy = createNpcEconomyService(markets, physical, economyResources, npcs, {
  positions,
  travel: {
    requestTravel: (npc, destinationId, reason) => sector.requestTravel(npc, destinationId, reason),
    requestPatrol: (npc) => sector.requestPatrol(npc),
    isTravelling: (npc) => sector.isTravelling(npc),
    quoteTravel: (npc, destinationId, credits) => sector.quoteTravel(npc, destinationId, credits),
  },
});

const startingCredits = new Map(npcs.map((npc) => [npc.id, npc.credits]));
const startingFuel = new Map(npcs.map((npc) => [npc.id, npc.fuel]));
const starts = new Map(npcs.map((npc) => [npc.id, npc.successfulRuns]));
const lastActive = new Map(npcs.map((npc) => [npc.id, 0]));
const previous = new Map(npcs.map((npc) => [npc.id, {
  locationId: npc.locationId,
  runs: npc.successfulRuns,
  credits: npc.credits,
  cargo: JSON.stringify(npc.cargo),
}]));
const minCredits = new Map(npcs.map((npc) => [npc.id, npc.credits]));
const zeroCreditDays = new Map(npcs.map((npc) => [npc.id, 0]));

function checkBalances(day) {
  for (const npc of npcs) {
    assert(Number.isFinite(npc.credits) && npc.credits >= 0, npc.id + ': invalid credits on day ' + day);
    assert(Number.isFinite(npc.fuel) && npc.fuel >= 0, npc.id + ': invalid fuel on day ' + day);
    assert(npc.fuel <= npc.fuelCapacity + 0.001, npc.id + ': overfilled tank');
    assert(npc.hullHp >= 0 && npc.hullHp <= npc.hullMaxHp, npc.id + ': invalid hull');
    const cargoUnits = Object.values(npc.cargo).reduce((sum, amount) => {
      assert(Number.isFinite(amount) && amount >= 0, npc.id + ': invalid cargo');
      return sum + amount;
    }, 0);
    assert(cargoUnits <= npc.cargoCapacity, npc.id + ': overfilled cargo');
    minCredits.set(npc.id, Math.min(minCredits.get(npc.id), npc.credits));
    if (npc.credits === 0) zeroCreditDays.set(npc.id, zeroCreditDays.get(npc.id) + 1);
    const before = previous.get(npc.id);
    const after = {
      locationId: npc.locationId,
      runs: npc.successfulRuns,
      credits: npc.credits,
      cargo: JSON.stringify(npc.cargo),
    };
    if (
      before.locationId !== after.locationId ||
      before.runs !== after.runs ||
      before.credits !== after.credits ||
      before.cargo !== after.cargo
    ) lastActive.set(npc.id, day);
    previous.set(npc.id, after);
  }
  for (const market of markets.snapshot()) {
    for (const entry of Object.values(market.entries)) {
      assert(Number.isFinite(entry.stock) && entry.stock >= 0, market.locationId + ': invalid stock');
      assert(Number.isFinite(entry.price) && entry.price > 0, market.locationId + ': invalid price');
    }
  }
}

for (let day = 0; day < DAYS; day += 1) {
  physical.advanceDay(day);
  economy.advanceDay(day);
  for (let step = 0; step < STEPS_PER_DAY; step += 1) {
    economy.tick(STEP_SECONDS);
    sector.tick(STEP_SECONDS);
  }
  checkBalances(day);
}

const jobNames = ['freighter', 'miner', 'salvager', 'patrol', 'pirate'];
const summary = jobNames.map((job) => {
  const members = npcs.filter((npc) => npc.job === job);
  const aggregate = (selector) => members.reduce((total, npc) => total + selector(npc), 0);
  return {
    job,
    ships: members.length,
    startingCredits: aggregate((npc) => startingCredits.get(npc.id)),
    finalCredits: aggregate((npc) => npc.credits),
    completedLegs: aggregate((npc) => npc.successfulRuns - starts.get(npc.id)),
    withoutCompletedLegs: members.filter((npc) => npc.successfulRuns === starts.get(npc.id)).length,
    inactiveLast30Days: members.filter((npc) => DAYS - 1 - lastActive.get(npc.id) >= 30).length,
    zeroCreditDays: aggregate((npc) => zeroCreditDays.get(npc.id)),
    lowFuelShips: members.filter((npc) => npc.fuel < npc.fuelCapacity * 0.1).length,
    lootRevenue: aggregate((npc) => npc.pirateLootRevenue ?? 0),
    operatingExpenses: aggregate((npc) => npc.pirateOperatingExpenses ?? 0),
  };
});

assert.equal(npcs.length, 33);
assert(summary.some((row) => row.job === 'pirate' && row.ships === 9));
assert(summary.every((row) => row.finalCredits >= 0));
console.log('ECONOMY LONGRUN AUDIT ' + JSON.stringify({
  days: DAYS,
  simulatedSecondsPerDay: STEPS_PER_DAY * STEP_SECONDS,
  noAutomaticCombat: true,
  groups: summary,
}));

// Scripted successful NPC raid: prove a physical cargo transfer can be monetized
// without creating goods or awarding free combat credits. Not an automatic combat test.
const pirate = npcs.find((npc) => npc.pirate);
const victim = npcs.find((npc) => npc.job === 'freighter');
assert(pirate && victim);
const market = markets.getEntry('blackjaw-outpost', 'ferrite');
assert(market && market.stock >= 5);
market.stock -= 5;
victim.cargo.ferrite = (victim.cargo.ferrite ?? 0) + 5;
const beforeGoods = market.stock + (victim.cargo.ferrite ?? 0) + (pirate.cargo.ferrite ?? 0);
const stolen = transferPirateLoot(pirate, victim);
assert(stolen >= 5, 'scripted successful raid must transfer available physical cargo');
pirate.locationId = 'blackjaw-outpost';
delete pirate.travel;
delete pirate.combatMovement;
const beforeRevenue = pirate.pirateLootRevenue ?? 0;
sector.tick(0.25);
const afterGoods = market.stock + (victim.cargo.ferrite ?? 0) + (pirate.cargo.ferrite ?? 0);
assert.equal(afterGoods, beforeGoods, 'raid and resale must conserve physical ferrite');
assert((pirate.pirateLootRevenue ?? 0) > beforeRevenue, 'pirate must receive resale revenue');
const afterRevenue = pirate.pirateLootRevenue;
sector.tick(0.25);
assert.equal(pirate.pirateLootRevenue, afterRevenue, 'repeat servicing must not duplicate sales');
console.log('PASS 90-day NPC economy audit and scripted physical pirate raid resale');
