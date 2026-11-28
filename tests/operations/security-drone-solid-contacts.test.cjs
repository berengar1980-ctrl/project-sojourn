'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { resolveSecurityDroneSolidContacts } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/operations/security-drone-solid-contact.ts'
);
const near = (a, b) => Math.abs(a - b) < 0.001;

const bounds = { width: 1200, height: 1000 };
const ship = [{ id: 'player', position: { x: 400, y: 400 }, radius: 35 }];
const hit = resolveSecurityDroneSolidContacts({ x: 405, y: 400 }, { x: 0, y: 0 }, [], ship, bounds);
assert(hit.contacts > 0, 'drone shield must physically contact player hulls');
assert(
  near(Math.hypot(hit.position.x - 400, hit.position.y - 400), 53.5),
  'drone must stay outside player shield plus its own 18m shield radius'
);
const collisionFree = resolveSecurityDroneSolidContacts(
  { x: 200, y: 200 },
  { x: 0, y: 0 },
  [],
  ship,
  bounds
);
assert.equal(collisionFree.contacts, 0);
assert.deepEqual(collisionFree.position, { x: 200, y: 200 });

const asteroid = {
  id: 'solid-rock',
  kind: 'resource',
  routeBlocking: true,
  position: { x: 500, y: 500 },
  radius: 75,
  collisionRadius: 68,
  physics: {
    mass: 50000,
    centerOfMassOffset: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    momentOfInertia: 50000,
  },
};
const rockHit = resolveSecurityDroneSolidContacts(
  { x: 480, y: 500 },
  { x: 0, y: 0 },
  [asteroid],
  [],
  bounds
);
assert(rockHit.contacts > 0, 'route-blocking asteroids also need actual shield contacts');
assert(
  Math.hypot(rockHit.position.x - asteroid.position.x, rockHit.position.y - asteroid.position.y) >=
    86.5,
  'drone and rock separate according to their mass ratio'
);

const ignoredDebris = {
  id: 'floating-fragment',
  kind: 'debris',
  routeBlocking: false,
  position: { x: 300, y: 300 },
  radius: 20,
};
const debrisHit = resolveSecurityDroneSolidContacts(
  { x: 300, y: 300 },
  { x: 0, y: 0 },
  [ignoredDebris],
  [],
  bounds
);
assert.equal(debrisHit.contacts, 0, 'debris stays with its separate kick/impulse physics');

const src = fs.readFileSync(
  path.join(root, 'src/systems/operations/asteroid-security-drone.ts'),
  'utf8'
);
assert(src.includes('resolveSecurityDroneSolidContacts('));
assert(src.includes('delete this.routeState'), 'drone must replan after collision');

const view = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-security-drone-visual.ts'),
  'utf8'
);
assert(view.includes('DRONE_DIAMETER_PX = 12'), 'rendered sprite must be 33% smaller');
assert(view.includes('DRONE_DIAMETER_PX * camera.getRelativeZoom()'));
console.log('PASS drone solid shield contacts, route invalidation and smaller sprite');
