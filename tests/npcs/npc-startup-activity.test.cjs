'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (pathInProject) => loadStandaloneTypeScriptModule(root, pathInProject);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { initializeNpcOpeningScenario } = load('src/systems/npcs/npc-opening-scenario.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { createPlayerTradeService } = load('src/systems/economy/player-trade-service.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');

const npcs = createSectorNpcEconomyStates();
const markets = createEconomyMarketService(sectorPorts, economyResources);
const player = createPlayerTradeService(markets).player;
const allocator = createEconomySimulationService(markets, player, economyResources, 41, npcs);
const sector = createNpcSectorService(narrowsSector, npcs, { markets });
const economy = createNpcEconomyService(markets, allocator, economyResources, npcs, {
  positions: Object.fromEntries(narrowsSector.locations.map((loc) => [loc.id, loc.position])),
  travel: {
    requestTravel: (npc, toId, reason) => sector.requestTravel(npc, toId, reason),
    requestPatrol: (npc) => sector.requestPatrol(npc),
    isTravelling: (npc) => sector.isTravelling(npc),
    quoteTravel: (npc, toId, credits) => sector.quoteTravel(npc, toId, credits),
  },
});
economy.advanceDay(0);
const resourceTotals = Object.fromEntries(
  economyResources.map((resource) => [resource.id, allocator.getResourceTotal(resource.id)])
);
const report = initializeNpcOpeningScenario(npcs, sector, economy, markets);
assert.equal(
  report.freightersInFlight,
  8,
  'eight of eleven freighters depart with funded loads'
);
assert.equal(report.minersWorking, 3);
assert.equal(report.salvagersWorking, 2);
assert.equal(report.patrolsInFlight, 2);
assert(
  npcs.some((npc) => npc.autonomy?.phase === 'resting'),
  'ships not assigned an active opening task must stay at their actual ports'
);
for (const npc of npcs.filter((entry) => entry.job === 'freighter' && entry.travel)) {
  assert(Object.values(npc.cargo).some((amount) => amount > 0), 'cargo comes from the market');
  assert(npc.credits < 3000000 + ((Number(npc.id.slice(4)) - 1) % 7) * 900000);
  assert(npc.travel.distanceTravelled > 0, 'freighters have a genuine completed flight leg');
  assert(npc.travel.distanceTravelled < npc.travel.routeDistance);
  assert(npc.fuel < npc.fuelCapacity, 'travelled distance must already consume fuel');
}
for (const resource of economyResources) {
  assert.equal(
    allocator.getResourceTotal(resource.id),
    resourceTotals[resource.id],
    'opening cargo and local extraction must conserve physically available resources'
  );
}
const workers = npcs.filter((npc) => npc.autonomy?.phase === 'working');
assert.equal(workers.length, 5);
assert(workers.every((npc) => npc.locationId === npc.workLocationId));

const civilians = npcs.filter((npc) => !npc.pirate);
const freighters = civilians.filter((npc) => npc.job === 'freighter');
assert.equal(
  new Set(freighters.map((npc) => npc.homePortId)).size,
  freighters.length,
  'freighters must start at distinct real trade ports throughout the sector'
);
const cluster = civilians.filter(
  (npc) => npc.locationId === 'haven' || npc.locationId === 'meridian-exchange'
);
assert(
  cluster.length <= 3,
  'Haven and its neighboring station must not contain the bulk of starting civilian traffic'
);
assert(
  readModuleSource(root, 'src/app/game-controller-star-map.ts').includes(
    'if (npc.hullHp <= 0) return []'
  ),
  'docked and orbiting vessels must stay visible as actual NPC ships'
);
assert(
  !readModuleSource(root, 'src/app/game-controller-star-map.ts').includes('npcVisibleInSpace'),
  'a ship must not disappear just because its economy is in a waiting phase'
);
assert(
  readModuleSource(root, 'src/app/game-controller-economy.ts').includes(
    'initializeNpcOpeningScenario(npcStates, sectorNpcs, npcEconomy, markets)'
  )
);
assert(
  !readModuleSource(root, 'src/app/bootstrap.ts').includes('warmStartTraffic'),
  'campaign setup must not simulate any historical NPC time'
);
console.log('PASS funded freight, working NPCs, conserved resources and no time warp');
