'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const yard = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-ownership-service.ts');
const loadoutsModule = loadStandaloneTypeScriptModule(
  root, 'src/systems/ships/ship-loadout-service.ts'
);
const crewModule = loadStandaloneTypeScriptModule(root, 'src/systems/crew/crew-roster-service.ts');
const profileModule = loadStandaloneTypeScriptModule(root, 'src/core/player-profile.ts');
const resources = loadStandaloneTypeScriptModule(root, 'src/data/economy/economy-resources.ts');

const starter = ships.getShipsByRole('salvage')[0];
const miner = ships.getShipsByRole('mining')[0];
const freighter = ships.getShipsByRole('freighter')[0];
assert(starter && miner && freighter);

let credits = yard.shipPurchasePrice(miner) * 2;
let withdrawals = 0;
const wallet = {
  takeCredits(amount) {
    if (amount <= 0 || credits < amount) return false;
    credits -= amount;
    withdrawals++;
    return true;
  },
};
const ownership = yard.createShipOwnershipService(starter.id, wallet);
assert.equal(ownership.owns(starter.id), true);
assert.equal(ownership.owns(miner.id), false);
assert.equal(ownership.purchase('nonexistent-hull'), null, 'no forged ship purchase');
assert.equal(withdrawals, 0);
const before = credits;
assert.equal(ownership.purchase(miner.id), yard.shipPurchasePrice(miner));
assert.equal(credits, before - yard.shipPurchasePrice(miner));
assert.equal(ownership.purchase(miner.id), null, 'hull cannot be purchased twice');
assert.equal(withdrawals, 1, 'charge exactly once');
const detached = ownership.snapshot();
detached.ownedShipIds.push('fake');
assert.equal(ownership.owns('fake'), false, 'ownership snapshot cannot mutate state');
assert.equal(ownership.owns(miner.id), true);

const broke = yard.createShipOwnershipService(starter.id, { takeCredits: () => false });
assert.equal(broke.purchase(freighter.id), null);
assert.equal(broke.owns(freighter.id), false, 'failed debit cannot grant ownership');

const loadouts = loadoutsModule.createShipLoadoutService();
const emptyCrew = { list: () => [] };
const player = { credits: 1000, cargo: {}, reservedCargoTons: 0 };
const trade = { player };
assert.equal(yard.shipActivationBlock(freighter, ownership, trade, emptyCrew, loadouts), 'not-owned');
assert.equal(yard.shipActivationBlock(miner, ownership, trade, emptyCrew, loadouts), null);

const manufactured = resources.economyResources.find((entry) => entry.categoryId !== 'raw');
assert(manufactured);
player.cargo[manufactured.id] = { qty: 1, totalCost: 100 };
assert.equal(
  yard.shipActivationBlock(miner, ownership, trade, emptyCrew, loadouts),
  'cargo-incompatible',
  'mining ship rejects non-raw cargo'
);
delete player.cargo[manufactured.id];
player.reservedCargoTons = 999999;
assert.equal(
  yard.shipActivationBlock(miner, ownership, trade, emptyCrew, loadouts),
  'cargo-overflow',
  'loose component reservations count toward cargo'
);
player.reservedCargoTons = 0;
const overfullCrew = { list: () => Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) };
assert.equal(yard.shipActivationBlock(miner, ownership, trade, overfullCrew, loadouts), 'crew-overflow');
assert.equal(yard.shipActivationBlock(miner, ownership, trade, emptyCrew, loadouts), null);
assert.equal(credits, before - yard.shipPurchasePrice(miner), 'activation checks must not spend money');

const profile = profileModule.createPlayerProfile({
  portraitId: 1,
  captainName: 'Mara Voss',
  shipName: 'Die Wanderin',
  combatSkills: { ranged: 80, melee: 50 },
  stationSkills: {
    piloting: 75, sensors: 75, weapons: 25, engineering: 25,
    salvage: 20, mining: 15, logistics: 10,
  },
  stationId: 'helm',
});
const crew = crewModule.createCrewRosterService(profile);
assert.equal(crew.assign(starter, 'helm', 'player'), true);
const recruit = crew.hire('torven_kray', starter);
assert(recruit);
assert.equal(crew.assign(starter, 'sensor_station', recruit.id), true);
crew.transferAssignments(starter, miner);
assert.equal(crew.assignments(miner).helm, 'player');
assert.equal(crew.assignments(miner).sensor_station, recruit.id);
assert.equal(crew.assignments(starter).sensor_station, recruit.id, 'old hull keeps assignments');
assert.equal(crew.assign(miner, 'helm', recruit.id), true);
crew.transferAssignments(starter, miner);
assert.equal(crew.assignments(miner).helm, recruit.id, 'return to a configured hull is stable');

console.log('PASS shipyard purchases, detached ownership, transfer preflight and crew continuity');
