'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const traffic = load('src/systems/navigation/field-traffic-obstacles.ts');
const motion = load('src/systems/salvage/salvage-container-motion.ts');
const { bindFieldTraffic, fieldTrafficObstacles } = traffic;
const { salvageFieldPhysicsBodies } = motion;
const { planSalvageRoute } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-work-navigation.ts',
  {
    'src/systems/navigation/field-traffic-obstacles.ts': traffic,
    'src/systems/salvage/salvage-container-motion.ts': motion,
  }
);
const field = {
  id: 'field-a',
  sourceLocationId: 'field-a',
  seed: 1,
  width: 1800,
  height: 1400,
  wrecks: [],
};
const other = { ...field, id: 'field-b' };
const start = { x: 200, y: 700 };
const target = { x: 1100, y: 700 };
const worker = { id: 'worker', position: { x: 650, y: 700 }, radius: 70 };
bindFieldTraffic(field, (excludedId) => (excludedId === worker.id ? [] : [worker]));
assert.equal(fieldTrafficObstacles(field, 'worker').length, 0);
assert.equal(fieldTrafficObstacles(other, 'player').length, 0);
assert.equal(planSalvageRoute(other, start, target, 70).length, 2);
assert(planSalvageRoute(field, start, target, 70).length > 2);
assert.equal(salvageFieldPhysicsBodies(field).length, 0, 'traffic is not a physics body');
worker.position.y = 300;
assert.equal(planSalvageRoute(field, start, target, 70).length, 2, 'live pose is queried');

console.log('PASS salvage route traffic is live, field-scoped and navigation-only');
