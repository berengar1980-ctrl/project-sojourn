'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const routes = loadStandaloneTypeScriptModule(root, 'src/systems/navigation/route-planner.ts');
const navigation = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/navigation-service.ts'
);

const world = {
  id: 'danger-test',
  name: 'Danger Test',
  width: 1200,
  height: 800,
  startLocationId: 'a',
  star: {
    id: 'star',
    name: 'Star',
    position: { x: 600, y: 50 },
    radius: 10,
    colorCore: '#fff',
    colorCorona: '#fff',
  },
  locations: [
    {
      id: 'a',
      name: 'A',
      kind: 'station',
      position: { x: 100, y: 400 },
      radius: 10,
      description: '',
      activities: {},
      dangerLevel: 0,
    },
    {
      id: 'b',
      name: 'B',
      kind: 'station',
      position: { x: 1100, y: 400 },
      radius: 10,
      description: '',
      activities: {},
      dangerLevel: 0,
    },
  ],
  regions: [
    {
      id: 'red-core',
      name: 'Red Core',
      center: { x: 600, y: 400 },
      radius: 240,
      dangerLevel: 3,
    },
  ],
};

const fast = routes.planRouteWithProfile(world, 'a', 'b', 'fast');
const safe = routes.planRouteWithProfile(world, 'a', 'b', 'safe');

assert.equal(fast.profile, 'fast');
assert.equal(safe.profile, 'safe');
assert(
  safe.points.length > 2,
  'safe routing must be able to generate a detour around an invisible danger region'
);
assert(
  safe.dangerLevel < fast.dangerLevel || safe.distance > fast.distance,
  'safe routing must trade distance for lower danger when a red region blocks the direct course'
);
assert(safe.distance >= 1000, 'detours must never under-report geometric route distance');

const service = navigation.createNavigationService(world, 'a', 240);
service.selectDestination('b');
const preview = service.getSnapshot().previewRoute;
assert(preview && preview.points.length > 2, 'player navigation must preview the routed detour');
service.startTravel();
for (let step = 0; step < 10000 && service.getSnapshot().isTravelling; step += 1) {
  service.tick(0.1);
}
assert.equal(service.getSnapshot().currentLocationId, 'b');
assert.equal(service.getSnapshot().isTravelling, false);

const sectorMap = loadStandaloneTypeScriptModule(
  root,
  'src/data/maps/narrows-sector.ts'
).narrowsSector;
assert(sectorMap.regions.length >= 5, 'The Narrows must define strategic danger regions');

const rendererSource = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
assert(
  rendererSource.includes('drawStarMapDangerRegions('),
  'fixed danger regions must now be visible on the star map'
);

console.log('PASS visible fixed danger regions and fast/balanced/safe route profiles');
