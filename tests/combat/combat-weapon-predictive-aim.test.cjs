'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { ballisticInterceptPoint } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-aim.ts'
);
const origin = { x: 0, y: 0 };
const target = { x: 500, y: 0 };
const stationary = ballisticInterceptPoint(origin, target, { x: 0, y: 0 }, 500);
assert.deepEqual(stationary, target, 'stationary targets need no lead');

const moving = ballisticInterceptPoint(origin, target, { x: 0, y: 100 }, 500);
assert(moving.y > 100, 'ballistic weapon aims ahead of crossing target');
const travel = Math.hypot(moving.x, moving.y) / 500;
assert(Math.abs(moving.y - 100 * travel) < 0.00001, 'intercept solves flight time correctly');
assert.deepEqual(
  ballisticInterceptPoint(origin, target, { x: 900, y: 0 }, 500),
  target,
  'impossible interception falls back to present target position'
);
assert.deepEqual(
  ballisticInterceptPoint(origin, target, { x: 0, y: 20 }, 0),
  target,
  'invalid projectile speeds never produce a nonfinite aim'
);
console.log('PASS constant-velocity ballistic lead, fallback and interception time');
