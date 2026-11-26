'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const routeTools = load('src/systems/navigation/fuel-route-planner.ts');
const { planFuelRoute, canFuelAt } = routeTools;
const { createFuelJourneyService } = load('src/app/game-controller-fuel-journey.ts');
const { visibleFuelJourneyRoute } = load('src/app/fuel-journey-route-view.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');

function location(id, x, kind, activities) {
  return {
    id,
    name: id,
    position: { x, y: 0 },
    kind,
    activities,
    dangerLevel: 0,
  };
}

const locations = [
  location('origin', 0, 'station', { dock: true }),
  location('refuel-a', 400, 'planet', { trade: true }),
  location('refuel-b', 800, 'station', { shipyard: true }),
  location('destination', 1200, 'moon', { dock: true }),
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

// A depleted tank must fail before building expensive hazard-aware routes.
// Both the total fuel/credit bound and the first-hop bound are conservative.
const unreachableWorld = { ...world, id: 'unreachable-fast-rejection' };
Object.defineProperty(unreachableWorld, 'regions', {
  get() {
    throw new Error('Unreachable route must not run the hazard pathfinder');
  },
});
assert.equal(planFuelRoute({ ...input, world: unreachableWorld, credits: 0 }), null);
assert.equal(planFuelRoute({ ...input, world: unreachableWorld, fuel: 1, credits: 100000 }), null);
const direct = planFuelRoute({ ...input, destinationId: 'refuel-a', credits: 0 });
assert(direct);
assert.deepEqual(direct.stopIds, []);
assert.equal(direct.fuelCost, 0);
const requestedBerths = new Set();
const directWithBerths = planFuelRoute({
  ...input,
  destinationId: 'refuel-b',
  fuel: 100,
  capacity: 100,
  credits: 0,
  locationPosition(id) {
    requestedBerths.add(id);
    return locations.find((entry) => entry.id === id).position;
  },
});
assert.deepEqual(directWithBerths.stopIds, []);
assert.equal(directWithBerths.totalFuel, 80);
assert.deepEqual(
  [...requestedBerths].sort(),
  ['origin', 'refuel-b'],
  'a direct flight must not inspect unrelated refueling berths'
);
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
// Returning from a dynamic salvage mission does not leave a permanent world node.
const missionOrigin = {
  ...input,
  fromId: 'salvage-special-0-1',
  fromPosition: { x: 200, y: 0 },
};
const fromMission = planFuelRoute(missionOrigin);
assert(fromMission, 'a valid salvage exit must not break normal fuel-aware destinations');
assert.equal(fromMission.route.fromId, 'deep-space');
assert.equal(fromMission.route.points[0].x, 200);
assert.equal(fromMission.directFuel, 100);
assert.deepEqual(fromMission.stopIds, ['refuel-a', 'refuel-b']);

const fromMissionWithBerths = planFuelRoute({
  ...missionOrigin,
  locationPosition(id) {
    const destination = locations.find((place) => place.id === id);
    if (!destination) throw new Error('Invalid berth: ' + id);
    return destination.position;
  },
});
assert(fromMissionWithBerths);
assert.deepEqual(fromMissionWithBerths.route.points[0], missionOrigin.fromPosition);

const withoutEventId = planFuelRoute({ ...missionOrigin, fromId: null });
assert(withoutEventId);
assert.equal(withoutEventId.totalDistance, fromMission.totalDistance);

const fromStaticSalvage = planFuelRoute({
  ...input,
  fromId: 'origin',
  fromPosition: locations[0].position,
  destinationId: 'refuel-a',
});
assert(fromStaticSalvage, 'ordinary mapped salvage sites must still use normal routing');

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
const mapNavigation = {
  isTravelling: true,
  activeRoute: route.legs[0].route,
  destinationId: 'refuel-a',
  progress: 0.5,
  currentPosition: { x: 200, y: 0 },
};
const remainingFirst = journey.snapshot().remainingIds;
const duringFirstLeg = visibleFuelJourneyRoute(route, remainingFirst, mapNavigation);
assert.deepEqual(
  duringFirstLeg.points.map((point) => point.x),
  [200, 400, 800, 1200],
  'map must not redraw already traversed geometry'
);
assert.equal(
  journey.arrived('refuel-a', navigation, () => true),
  true
);
assert.deepEqual(navigation.departures, ['refuel-a', 'refuel-b']);
const secondNavigation = {
  ...mapNavigation,
  activeRoute: route.legs[1].route,
  destinationId: 'refuel-b',
  progress: 0.5,
  currentPosition: { x: 600, y: 0 },
};
const remainingSecond = journey.snapshot().remainingIds;
const duringSecondLeg = visibleFuelJourneyRoute(route, remainingSecond, secondNavigation);
assert.deepEqual(
  duringSecondLeg.points.map((point) => point.x),
  [600, 800, 1200],
  'the previous fuel stop must disappear after arrival'
);
const observed = journey.snapshot();
observed.remainingIds.pop();
const detachedLength = journey.snapshot().remainingIds.length;
assert.equal(detachedLength, 2, 'itinerary snapshots must be detached');
assert.equal(
  journey.arrived('refuel-b', navigation, () => true),
  true
);
assert.deepEqual(navigation.departures, ['refuel-a', 'refuel-b', 'destination']);
assert.equal(
  journey.arrived('destination', navigation, () => true),
  false
);
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
