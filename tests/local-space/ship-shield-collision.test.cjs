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

const miner = registry.getShipsByRole('mining')[0];
const patrol = registry.getShipsByRole('patrol')[0];
assert(miner && patrol);

const first = {
  position: { x: 500, y: 500 },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  speed: 0,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  lateralThrust: 0,
};
const second = {
  position: { x: 505, y: 500 },
  velocity: { x: 0, y: 0 },
  headingRadians: Math.PI,
  speed: 0,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  lateralThrust: 0,
};

const impact = collisions.resolveShipShieldCollisions([
  { id: 'player', ship: miner, state: first },
  { id: 'npc', ship: patrol, state: second },
]);

assert.equal(impact.length, 1, 'overlapping ship shields must collide');
assert(
  Math.hypot(second.position.x - first.position.x, second.position.y - first.position.y) > 5,
  'shield collision must physically separate the ships'
);
assert.equal(
  collisions.resolveShipShieldCollisions([
    { id: 'player', ship: miner, state: first },
    { id: 'npc', ship: patrol, state: second },
  ]).length,
  0,
  'resolved shield bodies must no longer overlap'
);

console.log('PASS reusable ship-to-ship shield collision separates local ships');
