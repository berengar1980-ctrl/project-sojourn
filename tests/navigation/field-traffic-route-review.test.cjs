'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { reviewFieldTrafficRoute, trafficDestinationOccupied } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-traffic-obstacles.ts'
);
const { fieldRouteTarget } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-ship-routing.ts'
);
const start = { x: 100, y: 400 };
const destination = { x: 900, y: 400 };
const route = [start, destination];
const options = { start, asteroids: [], clearance: 40, width: 1200, height: 900 };
const obstacle = {
  id: 'parked-ship',
  position: { x: 500, y: 400 },
  radius: 60,
  velocity: { x: 0, y: 0 },
};
const detour = reviewFieldTrafficRoute(options, route, 1, [obstacle]);
assert(detour.route.length > 2);
assert.equal(detour.index, 1);
assert.deepEqual(detour.route.at(-1), destination);
const moving = { ...obstacle, velocity: { x: 0, y: 100 } };
assert.equal(reviewFieldTrafficRoute(options, route, 1, [moving]).route, route);
const occupied = { ...obstacle, position: destination };
assert(trafficDestinationOccupied(destination, [occupied], 40));
assert.equal(reviewFieldTrafficRoute(options, route, 1, [occupied]).route, route);
const ship = { position: start, headingRadians: 0, speed: 0 };
assert.equal(fieldRouteTarget(ship, destination, [occupied], 40), null);
assert.equal(ship.routeState, undefined);
assert.deepEqual(fieldRouteTarget(ship, destination, [], 40), destination);
// Two ships exchanging work locations must be able to start moving even
// when the other occupies the destination. The swept step remains guarded.
const departing = {
  ...occupied,
  intent: { priority: 1, movable: true, waitingSeconds: 0, direction: { x: -1, y: 0 } },
};
delete ship.routeState;
assert.deepEqual(fieldRouteTarget(ship, destination, [departing], 40), destination);
assert(
  !trafficDestinationOccupied(destination, [], 40) &&
    trafficDestinationOccupied(destination, [departing], 40)
);
console.log('PASS stationary traffic replanning and occupied destination handling');
