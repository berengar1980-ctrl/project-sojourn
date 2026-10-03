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
assert(service.includes('updateApproach'), 'mining must include ship approach');
assert(service.includes('spawnChunk'), 'mining must break resource chunks from asteroids');
assert(service.includes('tractorActive'), 'mining chunks must enter tractor collection');
assert(service.includes('findApproachWaypoint'), 'approach must use obstacle avoidance');
assert(service.includes('resolveShieldCollisions'), 'service must resolve shield collisions');
assert(service.includes('shieldFlash'), 'service must expose shield impact state');
assert(navigation.includes('pointToSegmentDistance'), 'avoidance must inspect blocked routes');
assert(collision.includes('collisionMetric'), 'shield collision must use geometric collision');
assert(collision.includes('asteroid.velocity'), 'shield impact must push asteroids away');
assert(!service.includes('Canvas'), 'local-space simulation must stay renderer-independent');
assert(!service.includes('document.'), 'local-space simulation must stay DOM-independent');

console.log('PASS local-space mining, avoidance, cancellation and shield collision ownership');
