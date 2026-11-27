'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { trafficStepClear } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-traffic-obstacles.ts'
);
const { moveFieldShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-ship-routing.ts'
);
const { advanceAutopilotRoute } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-autopilot.ts'
);

const start = { x: 0, y: 0 };
const next = { x: 10, y: 0 };
const crossing = {
  id: 'crossing',
  position: { x: 60, y: -60 },
  radius: 10,
  velocity: { x: 0, y: 100 },
};
assert(!trafficStepClear(start, next, 0.1, [crossing], 10), 'yield before crossing');
assert(
  trafficStepClear(start, next, 0.1, [{ ...crossing, velocity: { x: 0, y: -100 } }], 10),
  'departing ship must not trigger a stop'
);
const overlap = {
  id: 'overlap',
  position: { x: 5, y: 0 },
  radius: 10,
  velocity: { x: 0, y: 0 },
};
assert(!trafficStepClear(start, next, 0.1, [overlap], 10));
assert(trafficStepClear(start, { x: -10, y: 0 }, 0.1, [overlap], 10));

const target = { x: 200, y: 0 };
const ship = { position: { ...start }, headingRadians: 0, speed: 0 };
assert.equal(moveFieldShip(ship, target, 100, 0.1, [crossing], 10), false);
assert.deepEqual(ship.position, start);
const saved = ship.routeState;
assert(saved);
assert.equal(moveFieldShip(ship, target, 100, 0.1, [], 10), false);
assert.equal(ship.routeState, saved, 'yielding must retain the existing route');
assert.deepEqual(ship.position, next);

const player = { position: { ...start }, headingRadians: 0, speed: 0 };
const route = [target];
const result = advanceAutopilotRoute(player, route, 0, 100, 0.1, false, false, 1, {
  obstacles: [crossing],
  clearance: 10,
});
assert.deepEqual(result, { nextIndex: 0, completed: false });
assert.deepEqual(player.position, start);
assert.equal(player.speed, 0);
console.log('PASS relative traffic prediction, safe separation and route retention');
