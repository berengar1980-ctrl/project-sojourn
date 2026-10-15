'use strict';
const assert = require('node:assert/strict');
const { load, pair, arena } = require('./maneuver-fixtures.cjs');
const { pilotCombatFlight } = load('src/systems/combat/combat-flight-controller.ts');
const { createCombatFlightOrder } = load('src/systems/combat/combat-flight-order.ts');
const { snapshot } = load('src/systems/combat/strategic-combat-geometry.ts');
const boost = load('src/systems/combat/combat-standard-boost.ts');
const [a, b] = pair();
a.velocity = { x: 130, y: 65 };
a.headingRadians = 0;
pilotCombatFlight(a, { velocity: { x: 0, y: 0 }, heading: 0 }, arena, 0.08);
assert(a.longitudinalThrust < 0, 'front RCS brakes forward motion');
assert(a.lateralThrust < 0, 'lateral RCS damps sideways drift');
assert.equal(snapshot(a).longitudinalThrust, a.longitudinalThrust);
assert.equal(snapshot(a).lateralThrust, a.lateralThrust);
for (let i = 0; i < 100; i++)
  pilotCombatFlight(a, { velocity: { x: 0, y: 0 }, heading: 0 }, arena, 0.08);
assert(a.speed < 1, 'pilot removes unwanted drift without an instantaneous velocity reset');
a.strategy = { kind: 'frontal', focus: 'forward', desiredRange: 500 };
a.maneuver = { kind: 'intercept' };
b.position = { x: a.position.x + 800, y: a.position.y };
b.velocity = { x: 0, y: 80 };
const order = createCombatFlightOrder(a, b, arena);
assert(order.heading > 0, 'intercept leads observed lateral motion');
assert(order.velocity.y > 0, 'translation follows observed enemy motion');
a.maneuver = { kind: 'hold' };
b.position = { x: a.position.x, y: a.position.y + 500 };
pilotCombatFlight(a, createCombatFlightOrder(a, b, arena), arena, 0.08);
assert(
  a.headingRadians > 0 && a.headingRadians <= 0.08 + 0.0001,
  'live aiming follows target within turn limit'
);
const [fast, normal] = pair();
normal.position = { ...fast.position };
normal.headingRadians = fast.headingRadians = 0;
let firstBonus = 0;
for (let i = 0; i < 21; i++) {
  boost.updateStandardCombatBoost(fast, { x: 1, y: 0 }, 1600, 500, 1, false, true, 0.08);
  pilotCombatFlight(fast, { velocity: { x: 200, y: 0 }, heading: 0 }, arena, 0.08);
  pilotCombatFlight(normal, { velocity: { x: 200, y: 0 }, heading: 0 }, arena, 0.08);
  if (i === 0) firstBonus = fast.speed - normal.speed;
}
assert(fast.boostRampSeconds > 1.5);
assert(fast.speed - normal.speed > firstBonus, 'boost thrust increases progressively');
console.log('PASS common pilot braking, RCS telemetry, interception, live tracking and boost ramp');
