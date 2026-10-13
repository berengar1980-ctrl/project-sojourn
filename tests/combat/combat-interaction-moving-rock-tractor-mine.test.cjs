'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { advanceCombatAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-motion.ts'
);
const { firstObstacleHit } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const { maybeLaunchTractorAsteroid, advanceThrownAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-asteroid-throw.ts'
);
const moving = {
  id: 'mobile',
  kind: 'resource',
  radius: 35,
  position: { x: 600, y: 400 },
  velocity: { x: 0, y: 100 },
  rotation: 0,
  angularVelocity: 0,
};
const field = {
  width: 1800,
  height: 1100,
  asteroids: [moving],
  obstacles: [{ id: 'mobile', position: moving.position, radius: 35 }],
};
const start = { x: 300, y: 500 };
const end = { x: 900, y: 500 };
assert.equal(firstObstacleHit(start, end, field.obstacles), null);
advanceCombatAsteroids(field, 1);
assert.equal(moving.position.y, 500);
assert.equal(field.obstacles[0].position.y, 500);
assert.equal(
  firstObstacleHit(start, end, field.obstacles).obstacle.id,
  'mobile',
  'a drifting asteroid begins blocking weapon trajectories'
);
advanceCombatAsteroids(field, 1);
assert.equal(
  firstObstacleHit(start, end, field.obstacles),
  null,
  'projectile line clears when obstacle moves out of lane'
);

const ship = (x, shieldHp) => ({
  position: { x, y: 250 },
  velocity: { x: 0, y: 0 },
  shieldHp,
  hullHp: 300,
  shieldMaxHp: 120,
  hullMaxHp: 300,
  shieldImpacts: [],
  headingRadians: 0,
  tactic: 'fight',
  subsystems: { tractor: 100, engine: 100, maximum: 100 },
  setup: {
    name: 'Tester',
    tractorRangeMeters: 600,
    damageMultiplier: 1,
    shieldGeometry: { centerOffset: { x: 0, y: 0 }, radiusX: 25, radiusY: 20, modifier: 1 },
  },
});
const attacker = ship(200, 0);
const defender = ship(650, 120);
const payload = {
  id: 'moving-payload',
  kind: 'debris',
  radius: 12,
  position: { x: 250, y: 250 },
  velocity: { x: 4, y: 0 },
};
const mine = {
  id: 5,
  owner: 'attacker',
  armedSeconds: 0,
  pursuitRemaining: 0,
  position: { x: 310, y: 250 },
  definition: {
    id: 'ion-test',
    kind: 'ion',
    triggerRadiusMeters: 90,
    shieldDamage: 35,
    hullDamage: 15,
  },
};
const runtime = {
  attacker,
  defender,
  arena: { asteroids: [payload], obstacles: [] },
  mines: [mine],
  thrownAsteroids: [],
  combatLog: [],
  elapsedSeconds: 0,
  impactSerial: 0,
};
maybeLaunchTractorAsteroid(runtime, 'attacker', attacker, defender);
assert.equal(runtime.thrownAsteroids.length, 1, 'tractor captures one physical payload');
assert.equal(runtime.arena.asteroids.length, 0, 'captured asteroid exits ordinary collision list');
assert.equal(runtime.mines.length, 1, 'other mine remains active while tractor carries asteroid');
for (let step = 0; step < 50; step += 1) advanceThrownAsteroids(runtime, 0.08);
assert.equal(runtime.thrownAsteroids.length, 0, 'thrown payload eventually hits or expires');
assert.equal(runtime.mines.length, 1, 'unrelated mine survives thrown asteroid resolution');
assert(defender.shieldHp <= 120 && defender.hullHp <= 300, 'asteroid throw never heals target');
console.log('PASS moving asteroid occlusion and independent mine/tractor projectile lifecycle');
