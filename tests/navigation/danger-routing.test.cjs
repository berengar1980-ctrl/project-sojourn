'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const routes = loadStandaloneTypeScriptModule(root, 'src/systems/navigation/route-planner.ts');

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

const sectorMap = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts').narrowsSector;
assert(sectorMap.regions.length >= 5, 'The Narrows must define strategic danger regions');

const rendererSource = fs.readFileSync(
  path.join(root, 'src/ui/map/topdown-map-renderer.ts'),
  'utf8'
);
assert(
  !rendererSource.includes('this.drawRegions(width, height);'),
  'danger regions must influence routing without being rendered on the star map'
);

console.log('PASS hidden danger regions and fast/balanced/safe route profiles');
