'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { segmentRockHit } = load('src/core/compound-raycast.ts');
const { asteroidContactBound, asteroidContactProfile } = load(
  'src/core/asteroid-contact-profile.ts'
);
const { firstObstacleHit } = load('src/systems/combat/strategic-combat-damage.ts');

const rock = {
  id: 'natural-rock-ray',
  kind: 'resource',
  position: { x: 100, y: 100 },
  radius: 50,
  collisionRadius: 50 * asteroidContactBound('natural-rock-ray', 'resource'),
  rotation: 0,
};
const obstacle = { id: rock.id, position: rock.position, radius: rock.collisionRadius };
assert(
  segmentRockHit({ x: 0, y: 100 }, { x: 200, y: 100 }, rock),
  'ray through the physical rock center must hit'
);
assert.equal(
  segmentRockHit({ x: 0, y: 151 }, { x: 200, y: 151 }, rock),
  null,
  'transparent margin beyond the entire rock cannot intercept a beam'
);
assert(
  firstObstacleHit({ x: 0, y: 100 }, { x: 200, y: 100 }, [obstacle], [rock]),
  'combat laser, cover checks and projectile use the shared silhouette'
);
assert.equal(
  firstObstacleHit({ x: 0, y: 151 }, { x: 200, y: 151 }, [obstacle], [rock]),
  null,
  'distant shot must not hit invisible rock pixels'
);
const legacy = { id: 'wreck', position: { x: 100, y: 100 }, radius: 20 };
assert(
  firstObstacleHit({ x: 0, y: 100 }, { x: 200, y: 100 }, [legacy], [rock]),
  'legacy circular wrecks still stop shots'
);

const main = asteroidContactProfile(rock.id, 'resource')[0];
assert.equal(main.kind, 'ellipse');
assert.notEqual(main.radiusX, main.radiusY, 'elliptical rock geometry is noncircular');
const rotated = { ...rock, rotation: Math.PI / 2 };
const first = segmentRockHit({ x: 0, y: 100 }, { x: 200, y: 100 }, rock);
const second = segmentRockHit({ x: 0, y: 100 }, { x: 200, y: 100 }, rotated);
assert(first && second);
assert.notEqual(first.point.x, second.point.x, 'rotating an asymmetric rock moves its hit surface');

console.log('PASS shape-matched laser/projectile raycast and legacy obstacle fallback');
