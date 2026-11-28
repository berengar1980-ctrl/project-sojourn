'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { applyShipVelocityCommand, advanceShipDrift } = loadStandaloneTypeScriptModule(
  root,
  'src/core/ship-flight-physics.ts'
);

function ship(position = { x: 10, y: 20 }, velocity = { x: 0, y: 0 }) {
  return {
    position: { ...position },
    velocity: { ...velocity },
    headingRadians: 0,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
  };
}

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
}

const rcs = ship();
applyShipVelocityCommand(rcs, {
  direction: { x: 0, y: 1 },
  targetSpeed: 100,
  acceleration: 30,
  accelerationMultiplier: 0.4,
  deltaSeconds: 0.1,
});
close(rcs.velocity.x, 0, 'RCS x');
close(rcs.velocity.y, 1.2, 'RCS limited acceleration');
close(rcs.position.x, 10, 'RCS position x');
close(rcs.position.y, 20.12, 'RCS position y');

const tractorAssist = ship();
applyShipVelocityCommand(tractorAssist, {
  direction: { x: 1, y: 0 },
  targetSpeed: 100,
  acceleration: 30,
  accelerationMultiplier: 1.2,
  deltaSeconds: 0.1,
});
close(tractorAssist.velocity.x, 3.6, 'tractor acceleration assist');

const boostRamp = ship();
applyShipVelocityCommand(boostRamp, {
  direction: { x: 1, y: 0 },
  targetSpeed: 100,
  acceleration: 30,
  deltaSeconds: 0.1,
  boost: {
    active: true,
    speedMultiplier: 1.65,
    accelerationRampMultiplier: 2.5,
    rampSeconds: 1,
    rampDurationSeconds: 2,
  },
});
close(boostRamp.velocity.x, 6.75, 'boost ramp acceleration');

const tractorCap = ship();
applyShipVelocityCommand(tractorCap, {
  direction: { x: 1, y: 0 },
  targetSpeed: 100,
  targetSpeedCap: 25,
  acceleration: 30,
  deltaSeconds: 1,
});
close(tractorCap.velocity.x, 25, 'tractor speed cap');

const braking = ship({ x: 0, y: 0 }, { x: 20, y: 0 });
applyShipVelocityCommand(braking, {
  direction: { x: 0, y: 0 },
  targetSpeed: 0,
  acceleration: 30,
  deltaSeconds: 0.5,
});
close(braking.velocity.x, 0, 'stop command');

const drift = ship({ x: 9, y: 9 }, { x: 4, y: 6 });
advanceShipDrift(drift, 1, { left: 0, top: 0, right: 10, bottom: 10 });
assert.deepEqual(drift.position, { x: 10, y: 10 });
assert.deepEqual(drift.velocity, { x: 4, y: 6 }, 'drift keeps inertia at field edge');

console.log(
  'PASS shared flight commands preserve RCS, boost ramp, tractor cap, stop and bounded drift'
);
