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
assert(service.includes('MAX_TURN_RATE'), 'strategic travel must limit ship turning');
assert(service.includes('turnToward'), 'strategic travel must rotate over time');
assert(service.includes('targetSpeed'), 'strategic travel must calculate braking speed');
assert(service.includes('approachSpeed'), 'strategic travel must accelerate and decelerate');
assert(service.includes('currentSpeed'), 'travel must keep dynamic ship speed');
assert(service.includes('currentTurnRate'), 'travel must expose actual turn rate for RCS');
assert(
  types.includes('turnRateRadiansPerSecond'),
  'navigation snapshot must expose turn rate'
);
assert(types.includes('lateralThrust'), 'navigation snapshot must expose lateral thrust');
assert(
  !service.includes('currentHeading = heading(from, to);'),
  'travel start must not snap ship heading instantly'
);
assert(types.includes('currentPosition'), 'navigation snapshot must expose current position');
assert(types.includes('isTravelling'), 'navigation snapshot must expose travel state');
assert(!service.includes('requestAnimationFrame'), 'navigation must not own the UI frame loop');
assert(!service.includes('Canvas'), 'navigation must stay renderer-independent');

console.log('PASS inertial navigation travel ownership');
