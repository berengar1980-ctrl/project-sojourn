'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { maybeLaunchTractorAsteroid, advanceThrownAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-asteroid-throw.ts'
);
function setup(owner = 'attacker', armedSeconds = 0) {
  const ship = (x, shields) => ({
    position: { x, y: 250 },
    velocity: { x: 0, y: 0 },
    shieldHp: shields,
    hullHp: 300,
    shieldMaxHp: 120,
    hullMaxHp: 300,
    shieldImpacts: [],
    headingRadians: 0,
    tactic: 'minefield',
    subsystems: { tractor: 100, engine: 100, maximum: 100 },
    setup: {
      name: 'Tester',
      tractorRangeMeters: 600,
      tractorCanManipulateObjects: true,
      damageMultiplier: 1,
      shieldGeometry: { centerOffset: { x: 0, y: 0 }, radiusX: 25, radiusY: 20, modifier: 1 },
    },
  });
  const attacker = ship(200, 0);
  const defender = ship(650, 120);
  const mine = {
    id: 3,
    owner,
    armedSeconds,
    pursuitRemaining: 0,
    position: { x: 300, y: 250 },
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
    arena: { asteroids: [], obstacles: [] },
    mines: [mine],
    thrownAsteroids: [],
    combatLog: [],
    elapsedSeconds: 0,
    impactSerial: 0,
  };
  return { attacker, defender, runtime };
}
for (const [owner, armed] of [
  ['defender', 0],
  ['attacker', 1],
]) {
  const { attacker, defender, runtime } = setup(owner, armed);
  maybeLaunchTractorAsteroid(runtime, 'attacker', attacker, defender);
  assert.equal(runtime.thrownAsteroids.length, 0, 'enemy or unarmed mine cannot be captured');
  assert.equal(runtime.mines.length, 1, 'rejected mine stays deployed');
}
{
  const { attacker, defender, runtime } = setup();
  attacker.shieldHp = 10;
  maybeLaunchTractorAsteroid(runtime, 'attacker', attacker, defender);
  assert.equal(runtime.thrownAsteroids.length, 0, 'own active shield prohibits tractor');
  attacker.shieldHp = 0;
  maybeLaunchTractorAsteroid(runtime, 'attacker', attacker, defender);
  assert.equal(runtime.mines.length, 0, 'captured mine removed from ordinary mine simulation');
  assert.equal(runtime.thrownAsteroids.length, 1);
  assert.equal(runtime.thrownAsteroids[0].mineDefinition.id, 'ion-test');
  assert.equal(runtime.thrownAsteroids[0].phase, 'capture');
  maybeLaunchTractorAsteroid(runtime, 'attacker', attacker, defender);
  assert.equal(runtime.thrownAsteroids.length, 1, 'cooldown prevents repeated capture');
  for (let i = 0; i < 9; i += 1) advanceThrownAsteroids(runtime, 0.08);
  assert.equal(runtime.thrownAsteroids[0].phase, 'charge');
  for (let i = 0; i < 11; i += 1) advanceThrownAsteroids(runtime, 0.08);
  assert.equal(runtime.thrownAsteroids[0].phase, 'flight');
  for (let i = 0; i < 30; i += 1) advanceThrownAsteroids(runtime, 0.08);
  assert.equal(runtime.thrownAsteroids.length, 0, 'mine detonates or exits after flight');
  assert(
    runtime.combatLog.some((event) => event.detail.includes('MINE_DETONATE ion-test')),
    'existing mine damage pathway is used'
  );
}
console.log('PASS own-only tractor mine throw and five-phase reuse');
