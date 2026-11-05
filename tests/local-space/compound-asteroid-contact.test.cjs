'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { asteroidContactProfile, asteroidContactBound } = load(
  'src/core/asteroid-contact-profile.ts'
);
const { compoundContact, rockContactBody, shieldContactBody } = load(
  'src/core/compound-contact.ts'
);
const { createAsteroidOutline, asteroidRandom, hashAsteroidSeed } = load(
  'src/core/asteroid-silhouette.ts'
);
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { resolveShieldCollisions } = load('src/systems/local-space/local-space-collision.ts');
const { nativeCombatAsteroids } = load('src/systems/combat/combat-asteroid-motion.ts');

const ellipse = shieldContactBody({ x: 10, y: 0 }, 0, 8, 2);
const smallCircle = {
  position: { x: 0, y: 0 },
  angle: 0,
  shapes: [{ kind: 'circle', x: 0, y: 0, radius: 3 }],
  bound: 3,
};
const contact = compoundContact(smallCircle, ellipse);
assert(contact && contact.depth > 0, 'long side of ellipse contacts the circle');
assert(contact.normal.x > 0, 'collision normal points from first body toward second');
assert.equal(
  compoundContact(smallCircle, shieldContactBody({ x: 10, y: 0 }, Math.PI / 2, 8, 2)),
  null,
  'rotating long ellipse by a quarter turn opens an actual gap'
);
assert.equal(
  compoundContact(smallCircle, shieldContactBody({ x: 80, y: 0 }, 0, 8, 2)),
  null,
  'broad phase rejects distant bodies'
);

let elongated = 0;
for (let i = 0; i < 100; i += 1) {
  const id = 'asteroid-profile-' + i;
  const key = id + ':resource';
  const outline = createAsteroidOutline('resource', asteroidRandom(hashAsteroidSeed(key)));
  const x = Math.max(...outline.map((point) => Math.abs(point.x)));
  const y = Math.max(...outline.map((point) => Math.abs(point.y)));
  if (Math.max(x, y) > Math.min(x, y) * 1.25) elongated += 1;
  const profile = asteroidContactProfile(id, 'resource');
  assert(profile.length >= 1 && profile.length <= 3, 'rock uses at most three collision solids');
  assert.equal(profile[0].kind, 'ellipse', 'main rock footprint is an ellipse');
  const bound = asteroidContactBound(id, 'resource');
  assert(bound > 0.25 && bound < 1, 'shape bound stays inside sprite scale');
  assert.deepEqual(profile, asteroidContactProfile(id, 'resource'), 'profile deterministic by id');
}
assert(elongated > 20, 'procedural foreground contains visibly oblong families');

const field = generateMiningSpace('compound-test', 127);
assert(
  field.asteroids.every((asteroid) => asteroid.contactGeometry === 'silhouette'),
  'all generated mining rocks and debris use shared seeded silhouettes'
);
const natural = field.asteroids.find((asteroid) => asteroid.kind === 'resource');
assert(natural);
const moved = {
  ...natural,
  position: { x: 500, y: 300 },
  physics: { ...natural.physics, velocity: { x: 0, y: 0 } },
};
const body = rockContactBody(moved);
assert(body.shapes.length > 0);
const fallback = rockContactBody({
  ...moved,
  contactGeometry: undefined,
  collisionRadius: 20,
});
assert.equal(fallback.shapes.length, 1, 'legacy salvage collider remains circular');

const shield = { centerOffset: { x: 0, y: 0 }, radiusX: 30, radiusY: 15 };
const ship = {
  position: { x: 500 - moved.collisionRadius - 27, y: 300 },
  headingRadians: 0,
  speed: 40,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  lateralThrust: 0,
};
resolveShieldCollisions(ship, { x: 40, y: 0 }, [moved], shield);
assert(Number.isFinite(moved.position.x), 'compound shield response remains finite');

const combat = nativeCombatAsteroids({
  asteroids: [
    {
      ...natural,
      velocity: { x: 0, y: 0 },
    },
  ],
});
assert.equal(combat[0].contactGeometry, 'silhouette', 'combat inherits natural-rock solids');
assert.equal(combat[0].radius, natural.radius, 'combat retains visual envelope scale');
const scrap = nativeCombatAsteroids({
  asteroids: [
    {
      ...natural,
      debrisVariant: 'fragment',
      velocity: { x: 0, y: 0 },
    },
  ],
});
assert.equal(scrap[0].contactGeometry, undefined, '3D salvage mesh retains legacy contact disk');

console.log('PASS deterministic compound circles/ellipses, rotation and combat/mining parity');
