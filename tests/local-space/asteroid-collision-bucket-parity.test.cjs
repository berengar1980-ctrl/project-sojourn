'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { resolveAsteroidCollisions } = load('src/systems/local-space/local-space-collision.ts');
const { integrateAsteroids } = load('src/systems/local-space/local-space-physics.ts');
const { generateSalvageField } = load('src/systems/salvage/salvage-field-generator.ts');
const { salvageFieldPhysicsBodies } = load('src/systems/salvage/salvage-container-motion.ts');

const radius = (body) => body.collisionRadius ?? body.radius;
const cell = (point) => [Math.floor(point.x / 160), Math.floor(point.y / 160)];

// Reproduce the previous string-key broad phase, including its pair order,
// then delegate the actual two-body contact to the production solver.
function referenceCollisions(bodies) {
  const buckets = new Map();
  bodies.forEach((body, index) => {
    const key = cell(body.position).join(':');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  });
  const maxRadius = Math.max(0, ...bodies.map(radius));
  bodies.forEach((body, first) => {
    const [column, row] = cell(body.position);
    const reach = Math.max(1, Math.ceil((radius(body) + maxRadius) / 160));
    for (let y = -reach; y <= reach; y++) {
      for (let x = -reach; x <= reach; x++) {
        for (const second of buckets.get(column + x + ':' + (row + y)) ?? []) {
          if (second <= first) continue;
          resolveAsteroidCollisions([body, bodies[second]]);
        }
      }
    }
  });
}

for (const seed of [1, 17, 42]) {
  const field = generateSalvageField('bucket-parity', seed, 2);
  const actual = structuredClone(salvageFieldPhysicsBodies(field));
  // Force multiple contacts across cell boundaries, including negative cells.
  for (let i = 0; i < 12; i++) {
    actual[i].position = { x: -35 + i * 18, y: 160 + (i % 3) * 12 };
  }
  const expected = structuredClone(actual);
  resolveAsteroidCollisions(actual);
  referenceCollisions(expected);
  assert.deepEqual(actual, expected);
  for (let step = 0; step < 8; step++) {
    integrateAsteroids(actual, 0.05, field.width, field.height);
    integrateAsteroids(expected, 0.05, field.width, field.height);
    resolveAsteroidCollisions(actual);
    referenceCollisions(expected);
    assert.deepEqual(actual, expected, 'numeric buckets must preserve exact body states');
  }
}
console.log('PASS numeric asteroid collision buckets preserve legacy contact order and state');
