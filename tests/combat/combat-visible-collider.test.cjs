'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createDuelArena } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/duel-arena-presets.ts'
);
const { nativeCombatAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-motion.ts'
);
const { resolveCombatAsteroidContacts } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-contacts.ts'
);
const { asteroidSilhouetteInradius } = loadStandaloneTypeScriptModule(
  root,
  'src/core/asteroid-silhouette.ts'
);
for (const seed of [1, 53, 415]) {
  for (const kind of ['asteroid_field', 'scrap_scattered', 'scrap_field']) {
    const arena = createDuelArena(kind, seed);
    assert(arena.asteroids.length, 'test requires physical bodies');
    const native = nativeCombatAsteroids(arena);
    for (const [index, asteroid] of arena.asteroids.entries()) {
      assert(asteroid.collisionRadius > 0);
      assert(asteroid.collisionRadius < asteroid.radius, 'contact must be inside visual size');
      assert.equal(native[index].radius, asteroid.collisionRadius);
      const blocker = arena.obstacles.find((entry) => entry.id === asteroid.id);
      if (blocker) assert.equal(blocker.radius, asteroid.collisionRadius);
    }
  }
}
const asteroidArena = createDuelArena('scattered', 18);
const rock = asteroidArena.asteroids.find((asteroid) => asteroid.kind === 'resource');
assert(rock);
const ratio = asteroidSilhouetteInradius(rock.id, rock.kind);
assert(ratio > 0.65 && ratio < 1, 'rock footprint follows deterministic surface contour');

function ship(rock, distance) {
  return {
    setup: {
      shieldGeometry: { centerOffset: { x: 0, y: 0 }, radiusX: 50, radiusY: 20, modifier: 1 },
    },
    position: { x: rock.position.x - distance, y: rock.position.y },
    velocity: { x: 30, y: 0 },
    headingRadians: 0,
    speed: 30,
    shieldHp: 100,
    shieldMaxHp: 100,
    hullHp: 100,
    shieldImpacts: [],
  };
}
const oneRock = { ...rock, position: { ...rock.position }, velocity: { x: 0, y: 0 } };
const ghost = ship(oneRock, 50 + (oneRock.radius + oneRock.collisionRadius) * 0.5);
resolveCombatAsteroidContacts(ghost, { asteroids: [oneRock] });
assert.equal(ghost.shieldImpacts.length, 0, 'invisible draw-envelope gap must not hit shield');
assert.equal(ghost.shieldHp, 100);
const contact = ship(oneRock, 50 + oneRock.collisionRadius - 3);
resolveCombatAsteroidContacts(contact, { asteroids: [oneRock] });
assert(contact.shieldImpacts.length > 0, 'real solid contact must still damage shields');

console.log('PASS seeded visible rock outlines and matched scrap contact/nav radii');
