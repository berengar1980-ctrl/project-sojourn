'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { pilotExchangeShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-pilot.ts'
);
function ship(velocity) {
  return {
    position: { x: 500, y: 500 },
    velocity: { x: velocity.x, y: velocity.y },
    headingRadians: 0,
    speed: Math.hypot(velocity.x, velocity.y),
    tactic: 'fight',
    setup: { combatSpeed: 160, accelerationMetersPerSecond2: 45, turnRateRadiansPerSecond: 1.5 },
    subsystems: { engine: 100 },
  };
}
const arena = { width: 3000, height: 2000, obstacles: [] };
const plan = {
  initiatorGoal: { x: 570, y: 500 },
  reactorGoal: { x: 570, y: 500 },
  initiatorHeading: 0,
  reactorHeading: 0,
};
const overshooting = ship({ x: 150, y: 65 });
const initialSpeed = overshooting.speed;
for (let index = 0; index < 75; index += 1) {
  pilotExchangeShip(overshooting, 'initiator', plan, arena, 0.08);
}
assert(
  overshooting.speed < initialSpeed,
  'pilot must actively reduce velocity after overshooting its waypoint'
);
assert(overshooting.velocity.y < 65, 'lateral RCS must reduce unwanted sideways drift');
const cruising = ship({ x: 0, y: 0 });
pilotExchangeShip(
  cruising,
  'initiator',
  {
    ...plan,
    initiatorGoal: { x: 1300, y: 500 },
  },
  arena,
  0.08
);
assert(cruising.velocity.x > 0, 'far waypoints still accelerate through main drive');
console.log('PASS predictive braking and lateral drift damping preserve inertia');
