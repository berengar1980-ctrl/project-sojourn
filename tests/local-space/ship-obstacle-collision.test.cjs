'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const registry = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const collisions = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/ship-shield-collision.ts'
);

const ship = registry.getShipsByRole('mining')[0];
assert(ship);

const state = {
  position: { x: 100, y: 100 },
  headingRadians: 0,
  speed: 0,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  lateralThrust: 0,
};

const impacts = collisions.resolveShipShieldObstacleCollisions(
  [{ id: 'npc-miner', ship, state }],
  [{ id: 'asteroid', position: { x: 105, y: 100 }, radius: 35 }]
);

assert.equal(impacts.length, 1, 'ship shield must collide with a circular local obstacle');
assert(
  Math.hypot(state.position.x - 105, state.position.y - 100) > 5,
  'collision must push the ship out instead of letting it pass through the obstacle'
);
assert.equal(
  collisions.resolveShipShieldObstacleCollisions(
    [{ id: 'npc-miner', ship, state }],
    [{ id: 'asteroid', position: { x: 105, y: 100 }, radius: 35 }]
  ).length,
  0,
  'resolved ship must no longer overlap the obstacle'
);

// A contact can push a ship into a later obstacle not in the initial bin query.
const chain = [
  { id: 'first', position: { x: 270, y: 100 }, radius: 45 },
  { id: 'second', position: { x: 155, y: 100 }, radius: 45 },
];
const distant = Array.from({ length: 40 }, (_, index) => ({
  id: 'far-' + index,
  position: { x: 3000 + index * 300, y: 2000 },
  radius: 20,
}));
const linear = { ...state, position: { x: 255, y: 100 } };
const indexed = { ...linear, position: { ...linear.position } };
const expected = collisions.resolveShipShieldObstacleCollisions(
  [{ id: 'worker', ship, state: linear }],
  chain
);
const actual = collisions.resolveShipShieldObstacleCollisions(
  [{ id: 'worker', ship, state: indexed }],
  [...chain, ...distant]
);
assert.deepEqual(actual, expected);
assert.deepEqual(indexed.position, linear.position);
assert(expected.length > 0);
console.log('PASS ship shields collide with asteroid/wreck-style circular obstacles');
