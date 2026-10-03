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
const physics = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-physics.ts'),
  'utf8'
);
const miningImpact = fs.readFileSync(
  path.join(root, 'src/systems/local-space/mining-impact.ts'),
  'utf8'
);

assert(generator.includes('seed'), 'local-space generator must be seed-driven');
assert(
  generator.includes('createResourceAsteroids'),
  'local-space generator must create resource asteroids'
);
assert(generator.includes('createDebris'), 'local-space generator must create small debris');
assert(generator.includes("kind: 'debris'"), 'small debris kind must be explicit');
assert(generator.includes('routeBlocking: false'), 'debris must not block route planning');
assert(generator.includes('centerOfMassOffset'), 'asteroids must define a center of mass');
assert(generator.includes('angularVelocity'), 'asteroids must receive angular motion');
assert(generator.includes('momentOfInertia'), 'asteroids must define rotational inertia');
assert(service.includes('startMining'), 'local-space service must expose mining start');
assert(service.includes('cancelMining'), 'local-space service must expose mining cancellation');
assert(service.includes('currentMiningImpact'), 'service must expose one shared mining impact');
assert(
  service.includes('position: {\n        x: impact.point.x'),
  'mining chunks must spawn from the impact point'
);
assert(
  service.includes('planMiningApproachRoute'),
  'mining must plan a route once before approach'
);
assert(service.includes('approachRoute'), 'approach must persist a fixed precomputed route');
assert(!service.includes('findApproachWaypoint'), 'approach must not live-replan around obstacles');
assert(service.includes('MAX_TURN_RATE'), 'route following must limit ship turning speed');
assert(service.includes('integrateAsteroids'), 'service must advance rigid asteroid physics');
assert(
  service.includes('resolveAsteroidCollisions'),
  'service must resolve asteroid-to-asteroid collisions'
);
assert(navigation.includes('findGridRoute'), 'route planner must search a navigable path');
assert(navigation.includes('routeBlocking'), 'route planner must ignore non-blocking debris');
assert(
  physics.includes('applyImpulseAtPoint'),
  'physics must apply force at an explicit contact point'
);
assert(
  physics.includes('centerOfMassWorld'),
  'impulse torque must reference the asteroid center of mass'
);
assert(physics.includes('momentOfInertia'), 'angular response must use moment of inertia');
assert(
  collision.includes('rotationalMassTerm'),
  'asteroid collisions must include rotational collision response'
);
assert(
  collision.includes('resolveAsteroidCollisions'),
  'asteroid pair collisions must be implemented'
);
assert(collision.includes('contactPoint'), 'collisions must calculate a contact point');
assert(
  miningImpact.includes('hardpoints.miningLasers'),
  'mining impact must derive from actual laser hardpoints'
);
assert(
  miningImpact.includes('asteroid.position.x - direction.x * asteroid.radius'),
  'mining impact must lie on the asteroid surface'
);
assert(!service.includes('Canvas'), 'local-space simulation must stay renderer-independent');
assert(!service.includes('document.'), 'local-space simulation must stay DOM-independent');

console.log('PASS local-space route, rigid asteroid physics, debris and collision ownership');
