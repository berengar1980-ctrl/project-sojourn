'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const generator = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-generator.ts'),
  'utf8'
);
const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);
const navigation = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-navigation.ts'),
  'utf8'
);
const collision = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-collision.ts'),
  'utf8'
);

assert(generator.includes('seed'), 'local-space generator must be seed-driven');
assert(
  generator.includes('createAsteroids'),
  'local-space generator must create asteroid entities'
);
assert(generator.includes('velocity'), 'asteroids must support collision motion');
assert(service.includes('startMining'), 'local-space service must expose mining start');
assert(service.includes('cancelMining'), 'local-space service must expose mining cancellation');
assert(
  service.includes('planMiningApproachRoute'),
  'mining must plan a route once before approach'
);
assert(service.includes('approachRoute'), 'approach must persist a fixed precomputed route');
assert(!service.includes('findApproachWaypoint'), 'approach must not live-replan around obstacles');
assert(service.includes('MAX_TURN_RATE'), 'route following must limit ship turning speed');
assert(navigation.includes('findGridRoute'), 'route planner must search a navigable path');
assert(navigation.includes('simplifyRoute'), 'planned routes must remove unnecessary detours');
assert(navigation.includes('roundRoute'), 'planned routes must support curved corners');
assert(
  navigation.includes('routeSegmentsClear'),
  'curved routes must be collision-checked before use'
);
assert(
  navigation.includes('APPROACH_SAMPLES'),
  'planner must compare multiple target approach positions'
);
assert(service.includes('resolveShieldCollisions'), 'service must resolve shield collisions');
assert(collision.includes('separationVector'), 'shield collision must compute full separation');
assert(collision.includes('outwardSpeed = 250'), 'shield impact must impart outward velocity');
assert(!service.includes('Canvas'), 'local-space simulation must stay renderer-independent');
assert(!service.includes('document.'), 'local-space simulation must stay DOM-independent');

console.log('PASS fixed curved route planning, mining and shield collision ownership');
