'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const ships = load('src/systems/ships/ship-registry.ts');
const ownershipApi = load('src/systems/ships/ship-ownership-service.ts');
const components = load('src/systems/ships/ship-component-service.ts');
const transactions = load('src/systems/ships/shipyard-component-transactions.ts');
const tradeApi = load('src/systems/economy/player-trade-service.ts');
const inventoryApi = load('src/systems/ships/ship-component-inventory-service.ts');
const loadoutApi = load('src/systems/ships/ship-loadout-service.ts');
const researchApi = load('src/systems/ships/shipyard-research-service.ts');
const runtimeApi = load('src/systems/ships/ship-runtime.ts');
const crewApi = load('src/systems/crew/crew-roster-service.ts');
const profileApi = load('src/core/player-profile.ts');
const portData = load('src/data/ports/sector-ports.ts');

const starter = ships.getShipsByRole('salvage')[0];
const freighter = ships.getShipsByRole('freighter')[0];
assert(starter && freighter);
assert(portData.sectorPortByLocationId('karth-industrial').shipyard);

const trade = tradeApi.createPlayerTradeService({}, 20000000);
const inventory = inventoryApi.createShipComponentInventoryService(trade.player);
const loadouts = loadoutApi.createShipLoadoutService();
const research = researchApi.createShipyardResearchService();
const profile = profileApi.createPlayerProfile({
  portraitId: 1,
  captainName: 'Mara Voss',
  shipName: 'Die Wanderin',
  combatSkills: { ranged: 80, melee: 50 },
  stationSkills: {
    piloting: 75,
    sensors: 75,
    weapons: 25,
    engineering: 25,
    salvage: 20,
    mining: 15,
    logistics: 10,
  },
  stationId: 'helm',
});
const crew = crewApi.createCrewRosterService(profile);
const ownership = ownershipApi.createShipOwnershipService(starter.id, trade);
let active = starter;
const initialCredits = trade.player.credits;
const hullPrice = ownershipApi.shipPurchasePrice(freighter);

// 1. Buy a new ship through the same canonical credit and ownership services as the dock.
assert.equal(ownership.purchase(freighter.id), hullPrice);
assert.equal(ownership.owns(freighter.id), true);
assert.equal(ownership.purchase(freighter.id), null);
assert.equal(trade.player.credits, initialCredits - hullPrice);

function workshop() {
  return {
    ship: active,
    trade,
    inventory,
    loadouts,
    research,
    cargoCapacityTons: runtimeApi.resolveShipRuntimeSetup(active, {
      installed: loadouts.get(active),
    }).cargoCapacityTons,
    locationId: 'karth-industrial',
  };
}

// 2. Recover a rare efficient engine, sell/analyze it, and unlock that exact model variant.
const specialFactory = components.createSpecialSalvageComponentId;
const specialId = specialFactory('engine', 'engine1', 'efficiency', 15);
assert(specialId);
const salvaged = inventory.store(
  'engine',
  specialId,
  'wreck-integration',
  workshop().cargoCapacityTons
);
assert(salvaged);
const sale = transactions.sellShipyardComponent(workshop(), salvaged.uid);
assert(sale && sale.researched);
const improvedId = components.createShipyardVariantId('engine', 'engine1', 'efficiency', 15);
assert(improvedId);
assert(
  research.variants('engine', 3).some((part) => part.id === improvedId),
  'salvage research unlocks improved engine in real shipyard catalog'
);
assert.equal(research.variants('shield', 3).length, 0, 'no unrelated model unlock');

// 3. Purchase and install the improved component using the exact dock transaction functions.
const improvement = components.getShipComponent('engine', improvedId);
assert(improvement);
const creditsBeforeComponent = trade.player.credits;
assert.equal(transactions.purchaseShipyardComponent(workshop(), 'engine', improvedId), true);
assert.equal(trade.player.credits, creditsBeforeComponent - improvement.cost);
const purchased = inventory.list().find((part) => part.componentId === improvedId);
assert(purchased && purchased.source === 'purchased');
const inventoryBeforeRejectedInstall = inventory.snapshot();
const loadoutsBeforeRejectedInstall = loadouts.snapshot();
assert.equal(
  transactions.installShipyardComponent(workshop(), 'engine', 99, purchased.uid),
  false,
  'invalid slot must be rejected before consuming an upgrade'
);
assert.deepEqual(inventory.snapshot(), inventoryBeforeRejectedInstall);
assert.deepEqual(loadouts.snapshot(), loadoutsBeforeRejectedInstall);
assert.equal(transactions.installShipyardComponent(workshop(), 'engine', 0, purchased.uid), true);
assert.equal(loadouts.get(active).engine[0], improvedId);
assert(!inventory.list().some((part) => part.uid === purchased.uid), 'fitted part consumed once');
assert.equal(
  inventory.list().filter((part) => part.componentId === improvedId).length,
  0,
  'cannot duplicate a fitted component'
);
assert(
  components.getShipComponent('engine', improvedId).power <
    components.getShipComponent('engine', 'engine1').power,
  'efficiency modifier affects the actual installed component power budget'
);

// 4. Crew and equipment must survive switching back and forth across purchased hulls.
const recruit = crew.hire('torven_kray', starter);
assert(recruit);
assert.equal(crew.assign(starter, 'helm', 'player'), true);
assert.equal(crew.assign(starter, 'sensor_station', recruit.id), true);
function activate(next) {
  assert.equal(
    ownershipApi.shipActivationBlock(next, ownership, trade, crew, loadouts, active),
    null
  );
  crew.transferAssignments(active, next);
  active = next;
}
activate(freighter);
assert.equal(active.id, freighter.id);
assert.equal(loadouts.get(active).engine[0], 'engine1', 'new hull has its own base loadout');
assert.equal(crew.assignments(active).helm, 'player');
assert.equal(crew.assignments(active).sensor_station, recruit.id);

// Configure the other ship differently; returning must not overwrite either loadout.
assert.equal(transactions.purchaseShipyardComponent(workshop(), 'engine', 'engine2'), true);
const otherEngine = inventory.list().find((part) => part.componentId === 'engine2');
assert(otherEngine);
const equipped = transactions.installShipyardComponent(workshop(), 'engine', 0, otherEngine.uid);
assert.equal(equipped, true);
assert.equal(loadouts.get(active).engine[0], 'engine2');
assert.equal(crew.assign(active, 'helm', recruit.id), true);
activate(starter);
assert.equal(loadouts.get(active).engine[0], improvedId, 'improved engine persists on starter');
assert.equal(crew.assignments(active).helm, 'player', 'original captain station preserved');
assert.equal(crew.assignments(active).sensor_station, recruit.id);
activate(freighter);
assert.equal(loadouts.get(active).engine[0], 'engine2', 'second hull loadout preserved');
assert.equal(crew.assignments(active).helm, recruit.id, 'second hull assignment preserved');
assert.equal(ownership.snapshot().ownedShipIds.length, 2);
const secondEngineCost = components.getShipComponent('engine', 'engine2').cost;
const purchaseTotal = improvement.cost + secondEngineCost;
const expectedCredits = initialCredits - hullPrice + sale.credits - purchaseTotal;
assert.equal(trade.player.credits, expectedCredits, 'balance survives ship changes');

// UI adapters must invoke the same transaction functions that are covered above.
const portController = readModuleSource(root, 'src/app/game-controller-port.ts');
const shipyardUi = readModuleSource(root, 'src/ui/port/port-secondary-panes.ts');
for (const method of [
  'purchaseShipyardComponent(',
  'installShipyardComponent(',
  'sellShipyardComponent(',
  'shipActivationBlock(',
]) {
  assert(portController.includes(method), 'port controller missing transaction ' + method);
}
const dockMarkup = shipyardUi + readModuleSource(root, 'src/ui/port/port-panel.ts');
for (const hook of ['data-buy-ship-id', 'data-buy-catalog', 'data-component-slot-select']) {
  assert(dockMarkup.includes(hook), 'missing dock control ' + hook);
}
console.log('PASS shipyard integration: purchases, upgrades, fitting and hull switching');
