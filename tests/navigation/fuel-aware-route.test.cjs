'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const routeTools = load('src/systems/navigation/fuel-route-planner.ts');
const { planFuelRoute, canFuelAt } = routeTools;
const { createFuelJourneyService } = load('src/app/game-controller-fuel-journey.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');

const locations = [
  {
    id: 'origin',
    name: 'Origin',
    position: { x: 0, y: 0 },
    kind: 'station',
    activities: { dock: true },
    dangerLevel: 0,
  },
  {
    id: 'refuel-a',
    name: 'A',
    position: { x: 400, y: 0 },
    kind: 'planet',
    activities: { trade: true },
    dangerLevel: 0,
  },
  {
    id: 'refuel-b',
    name: 'B',
    position: { x: 800, y: 0 },
    kind: 'station',
    activities: { shipyard: true },
    dangerLevel: 0,
  },
  {
    id: 'destination',
    name: 'Destination',
    position: { x: 1200, y: 0 },
    kind: 'moon',
    activities: { dock: true },
    dangerLevel: 0,
  },
];
const world = {
  id: 'test-fueled-routing',
  width: 1300,
  height: 300,
  locations,
  regions: [],
};
const input = {
  world,
  fromId: 'origin',
  fromPosition: locations[0].position,
  destinationId: 'destination',
  profile: 'balanced',
  fuel: 50,
  capacity: 50,
  credits: 800,
  fuelPerDistance: 0.1,
};

assert.equal(canFuelAt(locations[0]), true);
assert.equal(canFuelAt(locations[1]), true);
assert.equal(canFuelAt({ ...locations[1], kind: 'asteroid-field' }), false);
assert.equal(planFuelRoute({ ...input, credits: 0 }), null);
assert.equal(planFuelRoute({ ...input, credits: 400 }), null);
const route = planFuelRoute(input);
assert(route, 'two funded fuel stops must make the long route reachable');
assert.deepEqual(route.stopIds, ['refuel-a', 'refuel-b']);
assert.equal(route.legs.length, 3);
assert.equal(route.totalDistance, 1200);
assert.equal(route.totalFuel, 120);
assert.equal(route.fuelCost, 800);
assert.equal(route.arrivalFuel, 10);
assert.equal(route.directFuel, 120);
assert.equal(route.route.points.length, 4);
const unrestrictedRoute = planFuelRoute({ ...input, fuel: 130, capacity: 130 });
assert.equal(unrestrictedRoute.stopIds.length, 0);

const navigation = {
  selected: null,
  departures: [],
  selectDestination(id) {
    this.selected = id;
  },
  startTravel() {
    this.departures.push(this.selected);
  },
};
const journey = createFuelJourneyService();
assert.equal(journey.start(route, navigation), true);
assert.deepEqual(navigation.departures, ['refuel-a']);
assert.deepEqual(journey.snapshot().plannedStops, ['refuel-a', 'refuel-b']);
assert.equal(journey.arrived('refuel-a', navigation, () => true), true);
assert.deepEqual(navigation.departures, ['refuel-a', 'refuel-b']);
const observed = journey.snapshot();
observed.remainingIds.pop();
const detachedLength = journey.snapshot().remainingIds.length;
assert.equal(detachedLength, 2, 'itinerary snapshots must be detached');
assert.equal(journey.arrived('refuel-b', navigation, () => true), true);
assert.deepEqual(navigation.departures, ['refuel-a', 'refuel-b', 'destination']);
assert.equal(journey.arrived('destination', navigation, () => true), false);
assert.equal(journey.snapshot().destinationId, null);

const npcPopulation = createSectorNpcEconomyStates();
const npc = npcPopulation.find((entry) => entry.job === 'freighter');
assert(npc);
npc.locationId = 'origin';
npc.fuel = 50;
npc.fuelCapacity = 50;
npc.fuelUse = 4;
npc.credits = 400;
npc.hullHp = npc.hullMaxHp;
delete npc.travel;
delete npc.combatMovement;
const npcs = createNpcSectorService(world, [npc]);
const startedWithoutCredits = npcs.requestTravel(npc, 'destination');
assert.equal(startedWithoutCredits, false, 'NPC cannot invent paid fuel');
npc.credits = 800;
assert.equal(npcs.requestTravel(npc, 'destination'), true);
assert.deepEqual(npc.travel.refuelStops, ['refuel-a', 'refuel-b']);
for (let i = 0; i < 800 && npc.travel; i += 1) npcs.tick(0.25);
assert.equal(npc.locationId, 'destination');
assert.equal(npc.credits, 0, 'NPC pays for both tank stops');
assert.equal(npc.fuel < 50, true, 'NPC consumes actual leg fuel');

console.log('PASS fuel-funded player and NPC itineraries');
