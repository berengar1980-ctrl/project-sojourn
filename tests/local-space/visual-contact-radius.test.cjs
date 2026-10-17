'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { resolveShieldCollisions, resolveAsteroidCollisions } = load(
  'src/systems/local-space/local-space-collision.ts'
);
const { planPointRoute } = load('src/systems/local-space/local-space-navigation.ts');
const { generateSalvageField } = load('src/systems/salvage/salvage-field-generator.ts');
const { salvageFieldPhysicsBodies } = load('src/systems/salvage/salvage-container-motion.ts');

const field = generateMiningSpace('footprint-test', 127);
for (const asteroid of field.asteroids) {
  assert(asteroid.collisionRadius > 0);
  assert(asteroid.collisionRadius < asteroid.radius);
}
const original = field.asteroids.find((asteroid) => asteroid.kind === 'resource');
assert(original);
const shield = { centerOffset: { x: 0, y: 0 }, radiusX: 30, radiusY: 16 };
const speed = { x: 26, y: 0 };
function ship(x) {
  return {
    position: { x, y: 300 },
    headingRadians: 0,
    speed: 26,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
  };
}
function asteroid() {
  return {
    ...original,
    position: { x: 500, y: 300 },
    physics: { ...original.physics, velocity: { x: 0, y: 0 } },
  };
}
const ghost = asteroid();
const drawGap = (ghost.radius + ghost.collisionRadius) / 2;
const distantHits = resolveShieldCollisions(ship(500 - 30 - drawGap), speed, [ghost], shield);
assert.equal(distantHits.length, 0, 'shield cannot hit the invisible draw-envelope margin');
const solid = asteroid();
const impact = resolveShieldCollisions(
  ship(500 - 30 - solid.collisionRadius + 2),
  speed,
  [solid],
  shield
);
assert.equal(impact.length, 1, 'physical rock core still rebounds from ship shield');

const first = asteroid();
const second = asteroid();
second.id = 'second';
const physicalWidth = first.collisionRadius + second.collisionRadius;
const envelopeWidth = first.radius + second.radius;
const gap = (physicalWidth + envelopeWidth) / 2;
second.position.x = first.position.x + gap;
resolveAsteroidCollisions([first, second]);
assert.equal(
  second.position.x,
  first.position.x + gap,
  'physics must not collide transparent margins'
);

const blocking = asteroid();
blocking.position = { x: 900, y: 660 };
const path = planPointRoute({
  start: { x: 500, y: 660 + blocking.collisionRadius + 2 },
  target: { x: 1300, y: 660 + blocking.collisionRadius + 2 },
  asteroids: [blocking],
  clearance: 0,
  width: 1800,
  height: 1200,
});
assert.equal(path.compromised, false, 'navigation clears physical rock footprint');

const salvage = generateSalvageField('footprint-test', 13);
const bodies = salvageFieldPhysicsBodies(salvage);
const owners = new Map([...salvage.wrecks, ...salvage.debris].map((owner) => [owner.id, owner]));
for (const body of bodies) {
  const owner = owners.get(body.id);
  assert(owner);
  assert(body.radius < owner.radius, 'salvage contact disk fits inside visible 3D mesh');
}
console.log('PASS mining, salvage and navigation share silhouette-derived physical contact radii');
