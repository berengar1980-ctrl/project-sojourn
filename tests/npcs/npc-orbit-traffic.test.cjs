'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { warmStartNpcTraffic, NPC_TRAFFIC_PREHISTORY_SECONDS } = load(
  'src/systems/npcs/npc-startup-traffic.ts'
);

const states = createSectorNpcEconomyStates();

// A location without an authored radius is valid in test worlds. It must never
// poison route lengths, cash requirements, or sensor positions with NaN.
const incompleteWorld = {
  id: 'missing-radius',
  width: 500,
  height: 500,
  locations: [
    {
      id: 'synthetic-station',
      kind: 'station',
      position: { x: 250, y: 250 },
      activities: { dock: true },
      dangerLevel: 0,
    },
  ],
  regions: [],
};
const testCaptain = { ...states[0], locationId: 'synthetic-station' };
const incompleteSector = createNpcSectorService(incompleteWorld, [testCaptain]);
assert.deepEqual(
  incompleteSector.livePosition(testCaptain),
  { x: 250, y: 250 },
  'a body without a defined radius must fall back to its finite center'
);

const sector = createNpcSectorService(narrowsSector, states);
const atHaven = states.filter((npc) => npc.locationId === 'haven');
assert(atHaven.length >= 2, 'fixture must include multiple ships at a world');
const haven = narrowsSector.locations.find((location) => location.id === 'haven');
assert(haven);
const berths = atHaven.map((npc) => sector.livePosition(npc));
for (const berth of berths) {
  assert(Math.hypot(berth.x - haven.position.x, berth.y - haven.position.y) > haven.radius);
}
assert.equal(
  new Set(berths.map((point) => point.x.toFixed(4) + ':' + point.y.toFixed(4))).size,
  berths.length,
  'different captains must not stack on the planet center or one another'
);

const freighter = atHaven.find((npc) => npc.job === 'freighter') ?? atHaven[0];
const oldPosition = sector.livePosition(freighter);
sector.tick(0.25);
const orbitMoved = sector.livePosition(freighter);
assert.notDeepEqual(orbitMoved, oldPosition, 'an idle ship must drift along its orbital lane');

const destinationId = 'karth-industrial';
const quote = sector.quoteTravel(freighter, destinationId);
assert(quote);
assert(sector.requestTravel(freighter, destinationId), 'NPC should depart its real berth');
const route = freighter.travel;
assert(route);
assert.deepEqual(route.routePoints[0], orbitMoved, 'departure must start from the visible ship');
const flightStart = sector.livePosition(freighter);
assert.deepEqual(flightStart, orbitMoved, 'launch must not teleport the ship to world center');
assert(
  Math.abs(route.routeDistance - quote.distance) < 1,
  'route must be fuel-quoted using orbital positions'
);
for (let i = 0; i < 2000 && sector.isTravelling(freighter); i += 1) sector.tick(0.25);
assert.equal(sector.isTravelling(freighter), false, 'ship must reach its orbital destination');
const arrival = sector.livePosition(freighter);
const lastRoutePoint = route.routePoints[route.routePoints.length - 1];
assert.deepEqual(arrival, lastRoutePoint, 'arrival must not jump to the planet center');

let sectorTicks = 0;
let economyTicks = 0;
let totalSectorTime = 0;
warmStartNpcTraffic(
  {
    tick(dt) {
      sectorTicks += 1;
      totalSectorTime += dt;
    },
  },
  {
    tick() {
      economyTicks += 1;
    },
  }
);
assert.equal(sectorTicks, economyTicks, 'startup must advance physical travel and trade together');
assert.equal(totalSectorTime, NPC_TRAFFIC_PREHISTORY_SECONDS);
assert(
  readModuleSource(root, 'src/app/game-controller-economy.ts').includes(
    'warmStartNpcTraffic(sectorNpcs, npcEconomy)'
  ),
  'real NPC population must have an already-running prehistory at game start'
);

console.log('PASS orbital NPC berths, moving idle traffic, physical trips and warm startup');
