'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { maybeLaunchTractorAsteroid, advanceThrownAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-asteroid-throw.ts'
);
function ship(x, shieldHp) {
  return {
    position: { x, y: 250 },
    velocity: { x: 0, y: 0 },
    shieldHp,
    hullHp: 300,
    subsystems: { tractor: 100 },
    setup: {
      name: 'Test ship',
      tractorRangeMeters: 500,
      tractorCanManipulateObjects: true,
      shieldGeometry: { radiusX: 25, radiusY: 20 },
    },
    tactic: 'fight',
  };
}
const attacker = ship(200, 100);
const defender = ship(650, 120);
const asteroid = {
  id: 'throwable',
  kind: 'debris',
  radius: 12,
  position: { x: 250, y: 250 },
  velocity: { x: 0, y: 0 },
};
const arena = { asteroids: [asteroid], obstacles: [] };
const runtime = {
  arena,
  attacker,
  defender,
  thrownAsteroids: [],
  elapsedSeconds: 0,
  combatLog: [],
  impactSerial: 0,
};
maybeLaunchTractorAsteroid(runtime, 'attacker', attacker, defender);
assert.equal(runtime.thrownAsteroids.length, 0, 'live own shield prohibits tractor throw');
attacker.shieldHp = 0;
maybeLaunchTractorAsteroid(runtime, 'attacker', attacker, defender);
assert.equal(runtime.thrownAsteroids.length, 1, 'shield down enables nearby tractor throw');
assert.equal(attacker.tractorThrowCooldown, 6, 'tractor asteroid throw recharges in six seconds');
assert.equal(
  arena.asteroids.length,
  0,
  'launched asteroid removed from stationary collision world'
);
assert.equal(runtime.thrownAsteroids[0].phase, 'capture');
for (let i = 0; i < 9; i += 1) advanceThrownAsteroids(runtime, 0.08);
assert.equal(runtime.thrownAsteroids[0].phase, 'charge');
for (let i = 0; i < 11; i += 1) advanceThrownAsteroids(runtime, 0.08);
assert.equal(runtime.thrownAsteroids[0].phase, 'flight');
assert.equal(defender.shieldHp, 120, 'no damage before projectile physically arrives');
for (let i = 0; i < 28; i += 1) advanceThrownAsteroids(runtime, 0.08);
assert.equal(runtime.thrownAsteroids.length, 0, 'asteroid hit or left field');
assert(defender.shieldHp < 120, 'throw delivers substantial shield damage');
assert(defender.hullHp < 300, 'overwhelming rock collision also reaches hull');
console.log('PASS shield-gated tractor asteroid projectile and dual-layer impact');
