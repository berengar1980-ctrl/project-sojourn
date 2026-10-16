'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { chooseCombatFlightIntent } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/combat-flight-intent.ts'
);
const arena = { width: 4200, height: 2600, exitPoint: { x: 50, y: 1300 } };
const ship = (x, vx = 0) => ({
  position: { x, y: 1000 },
  velocity: { x: vx, y: 0 },
  speed: Math.abs(vx),
  headingRadians: 0,
  tactic: 'fight',
  mineStock: [],
  setup: { combatSpeed: 120, aiControlled: true, weapons: [] },
  subsystems: { engine: 100, tractor: 0 },
  strategy: { kind: 'frontal', focus: 'forward', desiredRange: 1000 },
});
function order(a, b, desired = 1000) {
  return chooseCombatFlightIntent(a, b, desired, arena, 0.08, false);
}

const close = ship(1000);
const neighbor = ship(1086);
const separation = order(close, neighbor);
assert.equal(separation.kind, 'extend');
assert(separation.direction.x < 0, 'close frontal ship must steer away from hull contact');
assert(separation.speedFactor > 0.7);

const attacker = ship(1000, 100);
const defender = ship(2000, -100);
attacker.headingRadians = Math.PI / 2;
assert.notEqual(order(attacker, defender).kind, 'pass', 'unaligned bow cannot start a flyby');
attacker.headingRadians = 0;
const pass = order(attacker, defender);
assert.equal(pass.kind, 'pass');
assert(pass.direction.y > 0, 'flyby uses a nonzero crossing lane');
assert(attacker.flightPass, 'flyby commits a ship-local travel direction');
defender.position.y = 1200;
assert.deepEqual(order(attacker, defender).direction, pass.direction);
assert.equal(order(attacker, defender).kind, 'pass', 'moving target does not cancel commitment');

const runner = ship(1000);
runner.tactic = 'flee';
runner.flightPass = {
  direction: { x: 1, y: 0 },
  startRange: 300,
  closestRange: 300,
  ageSeconds: 0,
};
const retreat = order(runner, defender);
assert.equal(retreat.kind, 'escape');
assert(retreat.direction.x < 0);
assert.equal(runner.flightPass, undefined, 'flee cancels attack commitment');

const rammer = ship(1000);
assert.equal(
  chooseCombatFlightIntent(rammer, defender, 1000, arena, 0.08, true).kind,
  'ram',
  'only the canonical ram decision may override a regular pass'
);
console.log('PASS independent flight intent, flyby commitment and explicit escape priority');
