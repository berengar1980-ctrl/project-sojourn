'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const navigation = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-navigation.ts'
);
const { combatRouteHeading } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-routing.ts',
  { 'src/systems/local-space/local-space-navigation.ts': navigation }
);

const start = { x: 160, y: 700 };
const target = { x: 1040, y: 700 };
const obstacle = {
  id: 'shared-rock',
  position: { x: 600, y: 700 },
  radius: 100,
  collisionRadius: 100,
  routeBlocking: true,
  velocity: { x: 0, y: 0 },
};
const civilian = navigation.planPointRoute({
  start,
  target,
  asteroids: [obstacle],
  clearance: 55,
  width: 1200,
  height: 1400,
});
assert.equal(civilian.compromised, false, 'civil route keeps full collider clearance');

const combatShip = {
  position: start,
  velocity: { x: 0, y: 0 },
  tactic: 'fight',
  setup: { shieldGeometry: { radiusX: 35, radiusY: 41 } },
  asteroidRoute: [],
  nextAsteroidRouteAt: 0,
};
const combatArena = {
  width: 1200,
  height: 1400,
  obstacles: [{ id: obstacle.id, position: obstacle.position, radius: obstacle.radius }],
  asteroids: [{ id: obstacle.id, position: obstacle.position, velocity: obstacle.velocity }],
};
const heading = combatRouteHeading(combatShip, target, combatArena, 0.08);
assert(heading, 'combat obtains a waypoint from the shared planner');
assert.deepEqual(
  combatShip.asteroidRoute,
  civilian.route.slice(1),
  'combat and civilian callers receive the same production route for identical geometry'
);

const moving = {
  ...obstacle,
  position: { x: 600, y: 600 },
  velocity: { x: 0, y: 80 },
  radius: 55,
  collisionRadius: 55,
};
const unpredicted = navigation.planPointRoute({
  start,
  target,
  asteroids: [moving],
  clearance: 10,
  width: 1200,
  height: 1400,
});
const predicted = navigation.planPointRoute({
  start,
  target,
  asteroids: [moving],
  clearance: 10,
  predictionSeconds: 1.25,
  width: 1200,
  height: 1400,
});
assert.equal(unpredicted.route.length, 2, 'static geometry leaves the path open');
assert(predicted.route.length > 2, 'actual obstacle velocity predicts the crossing');

const blocked = navigation.planPointRoute({
  start,
  target: { x: 600, y: 700 },
  asteroids: [obstacle],
  clearance: 55,
  width: 1200,
  height: 1400,
});
assert.equal(blocked.compromised, true);
assert.deepEqual(
  blocked.route,
  [],
  'unreachable blocked destinations do not return a straight route'
);

console.log('PASS unified combat/civil route geometry, motion prediction and blocked destinations');
