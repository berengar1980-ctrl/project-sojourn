'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const service = fs.readFileSync(
  path.join(root, 'src/systems/navigation/navigation-service.ts'),
  'utf8'
);
const types = fs.readFileSync(
  path.join(root, 'src/systems/navigation/navigation-types.ts'),
  'utf8'
);

assert(service.includes('startTravel'), 'navigation must own travel start');
assert(service.includes('tick'), 'navigation must own travel progression');
assert(service.includes('interpolate'), 'navigation must calculate position during travel');
assert(types.includes('currentPosition'), 'navigation snapshot must expose current position');
assert(types.includes('isTravelling'), 'navigation snapshot must expose travel state');
assert(!service.includes('requestAnimationFrame'), 'navigation must not own the UI frame loop');
assert(!service.includes('Canvas'), 'navigation must stay renderer-independent');

console.log('PASS navigation travel ownership');
