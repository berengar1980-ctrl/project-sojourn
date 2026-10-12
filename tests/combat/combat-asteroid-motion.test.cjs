'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { advanceCombatAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-motion.ts'
);
const position = { x: 100, y: 100 };
const asteroid = {
  id: 'moving-rock',
  position,
  radius: 32,
  kind: 'resource',
  rotation: 0,
  velocity: { x: 12, y: -4 },
  angularVelocity: 0.2,
};
const arena = {
  width: 4200,
  height: 2600,
  asteroids: [asteroid],
  obstacles: [{ id: asteroid.id, position, radius: asteroid.radius }],
};
advanceCombatAsteroids(arena, 2);
assert.equal(asteroid.position.x, 124);
assert.equal(asteroid.position.y, 92);
assert.equal(asteroid.rotation, 0.4);
assert.equal(arena.obstacles[0].position.x, 124, 'collision obstacle follows asteroid');
const before = asteroid.position.x;
advanceCombatAsteroids(arena, 1);
assert(asteroid.position.x > before, 'asteroid continues drifting through combat');
console.log('PASS moving combat asteroids, shared collision coordinates and spin');
