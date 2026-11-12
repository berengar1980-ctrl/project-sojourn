'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const data = load('src/data/economy/sector-npc-economy.ts');
const opening = load('src/systems/npcs/npc-opening-scenario.ts');
const sectorModule = load('src/systems/npcs/npc-sector-service.ts');
const economyModule = load('src/systems/economy/npc-economy-service.ts');
const marketsModule = load('src/systems/economy/market-service.ts');
const simulationModule = load('src/systems/economy/economy-simulation-service.ts');
const playerModule = load('src/systems/economy/player-trade-service.ts');
const resources = load('src/data/economy/economy-resources.ts').economyResources;
const ports = load('src/data/ports/sector-ports.ts').sectorPorts;
const world = load('src/data/maps/narrows-sector.ts').narrowsSector;

const npcs = data.createSectorNpcEconomyStates();
const markets = marketsModule.createEconomyMarketService(ports, resources);
const player = playerModule.createPlayerTradeService(markets).player;
const allocator = simulationModule.createEconomySimulationService(
  markets,
  player,
  resources,
  41,
  npcs
);
const sector = sectorModule.createNpcSectorService(world, npcs, { markets });
const economy = economyModule.createNpcEconomyService(markets, allocator, resources, npcs, {
  positions: Object.fromEntries(world.locations.map((loc) => [loc.id, loc.position])),
  travel: {
    requestTravel: (npc, destination, reason) => sector.requestTravel(npc, destination, reason),
    requestPatrol: (npc) => sector.requestPatrol(npc),
    isTravelling: (npc) => sector.isTravelling(npc),
    quoteTravel: (npc, destination, credits) => sector.quoteTravel(npc, destination, credits),
  },
});
economy.advanceDay(0);

const totalsBefore = new Map(
  resources.map((resource) => [resource.id, allocator.getResourceTotal(resource.id)])
);
const report = opening.initializeNpcOpeningScenario(npcs, sector, economy, markets);
assert.equal(report.freightersInFlight, 8);
assert.equal(report.minersWorking, 3);
assert.equal(report.salvagersWorking, 2);
assert.equal(report.patrolsInFlight, 2);

const freighters = npcs.filter((npc) => npc.job === 'freighter');
const flyingFreighters = freighters.filter((npc) => npc.travel);
assert.equal(flyingFreighters.length, 8);
for (const npc of flyingFreighters) {
  const freight = Object.values(npc.cargo).reduce((sum, amount) => sum + amount, 0);
  const serial = Number(npc.id.slice(4)) - 1;
  const startingCredits = 3000000 + (serial % 7) * 900000;
  assert(freight > 0);
  assert(npc.credits < startingCredits);
  assert(npc.travel.distanceTravelled > 0);
  assert(npc.travel.distanceTravelled < npc.travel.routeDistance);
  assert(npc.fuel < npc.fuelCapacity);
}

for (const resource of resources) {
  const after = allocator.getResourceTotal(resource.id);
  assert.equal(after, totalsBefore.get(resource.id));
}

const workers = npcs.filter((npc) => npc.autonomy?.phase === 'working');
assert.equal(workers.length, 5);
assert(workers.every((npc) => npc.locationId === npc.workLocationId));
assert(npcs.some((npc) => npc.autonomy?.phase === 'resting'));

const civilian = npcs.filter((npc) => !npc.pirate);
const regularFreighters = freighters.filter((npc) => !npc.smuggler);
const regularHomes = new Set(regularFreighters.map((npc) => npc.homePortId));
assert.equal(
  regularHomes.size,
  regularFreighters.length,
  'ordinary freighters retain distinct home ports'
);
const smugglers = freighters.filter((npc) => npc.smuggler);
assert.equal(smugglers.length, 3);
assert(
  smugglers.every(
    (npc) => npc.homePortId === 'blackjaw-outpost' || npc.homePortId === 'gallows-anchor'
  ),
  'smuggler freighters share the two actual underworld bases'
);
const havenTraffic = civilian.filter((npc) => {
  return npc.locationId === 'haven' || npc.locationId === 'meridian-exchange';
});
assert(havenTraffic.length <= 3);

const mapSource = readModuleSource(root, 'src/app/game-controller-star-map.ts');
const economySource = readModuleSource(root, 'src/app/game-controller-economy.ts');
const startupSource = readModuleSource(root, 'src/app/bootstrap.ts');
assert(mapSource.includes('if (npc.hullHp <= 0) return []'));
assert(!mapSource.includes('npcVisibleInSpace'));
const scenarioCall = 'initializeNpcOpeningScenario(npcStates, sectorNpcs, npcEconomy, markets)';
assert(economySource.includes(scenarioCall));
assert(!startupSource.includes('warmStartTraffic'));

console.log('PASS funded freight, real work, resource conservation and no time warp');
