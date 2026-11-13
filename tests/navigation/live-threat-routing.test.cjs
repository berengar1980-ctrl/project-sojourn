'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const routes = loadStandaloneTypeScriptModule(root, 'src/systems/navigation/route-planner.ts');
const navigation = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/navigation-service.ts'
);
const location = (id, x) => ({
  id,
  name: id,
  position: { x, y: 1100 },
  kind: 'station',
  radius: 10,
  description: '',
  dangerLevel: 0,
  activities: { dock: true },
});
const world = {
  id: 'dynamic-risk-test',
  name: 'Dynamic Threat Test',
  width: 2100,
  height: 2200,
  startLocationId: 'a',
  star: {
    id: 'star',
    position: { x: 1050, y: 100 },
    radius: 10,
    colorCore: '#fff',
    colorCorona: '#fff',
  },
  locations: [location('a', 100), location('b', 1900)],
  regions: [],
};
const pirate = { kind: 'pirate', position: { x: 1000, y: 1100 }, strength: 1 };
const patrol = { kind: 'patrol', position: { x: 1000, y: 1100 }, strength: 1 };
const farPirate = { kind: 'pirate', position: { x: 1000, y: 2050 }, strength: 1 };
const staticSafe = routes.planRouteWithProfile(world, 'a', 'b', 'safe');
assert.strictEqual(
  routes.planRouteWithProfile(world, 'a', 'b', 'safe', [farPirate]),
  staticSafe,
  'far-away contacts must reuse the stable route instead of invalidating the NPC route cache'
);
assert.deepEqual(
  routes.planRouteFromPoint(world, { x: 100, y: 1100 }, 'b', 'safe', [farPirate]).points,
  routes.planRouteFromPoint(world, { x: 100, y: 1100 }, 'b', 'safe').points,
  'a distant pirate must not force a local deep-space detour'
);
const fast = routes.planRouteWithProfile(world, 'a', 'b', 'fast', [pirate]);
const safe = routes.planRouteWithProfile(world, 'a', 'b', 'safe', [pirate]);
assert.equal(fast.points.length, 2, 'fast mode must preserve the shortest direct route');
assert(safe.points.length > 2, 'safe route must detour around a real pirate contact');
assert(safe.distance > fast.distance, 'safety has a geometric travel cost');
assert(
  routes.routeThreatExposure(safe.points, [pirate]) <
    routes.routeThreatExposure(fast.points, [pirate])
);
assert(
  routes.routeThreatExposure(fast.points, [pirate, patrol]) <
    routes.routeThreatExposure(fast.points, [pirate]),
  'patrol cover must reduce actual route pressure'
);
assert.deepEqual(world.regions, [], 'NPC traffic must never change fixed geography');

const service = navigation.createNavigationService(world, 'a', 240);
assert.equal(service.getSnapshot().routeProfile, 'balanced');
service.setRouteProfile('safe');
service.setThreatContacts([pirate]);
service.selectDestination('b');
assert(service.getSnapshot().previewRoute.points.length > 2, 'selected mode must apply to preview');
service.setRouteProfile('fast');
assert.equal(
  service.getSnapshot().previewRoute.points.length,
  2,
  'route mode must change the preview'
);
service.setRouteProfile('safe');
service.setThreatContacts([]);
assert.equal(service.getSnapshot().previewRoute.points.length, 2);
service.startTravel();
service.setThreatContacts([pirate]);
service.tick(0.1);
assert(
  service.getSnapshot().activeRoute.points.length > 2,
  'a new real pirate threat must trigger a safer live detour'
);

console.log('PASS player routing profiles, live pirate/patrol weighting and meaningful replanning');
