'use strict';

const assert = require('node:assert/strict');
const { inspectTrajectory } = require('../../scripts/combat-trajectory-diagnostics.cjs');
const frame = (t, x, y, heading = 0) => ({
  t,
  a: [x, y, heading],
  b: [500, 0, Math.PI],
});
const passage = inspectTrajectory({
  trajectory: [
    frame(0, 0, 0),
    frame(0.8, 260, 0),
    frame(1.6, 480, 0),
    frame(2.4, 780, 0),
    frame(3.2, 1100, 0),
  ],
});
assert.equal(passage.passages, 1, 'close approach followed by separation counts once');
assert(passage.approachAndRecede >= 1, 'approach must be followed by receding');
assert(passage.forwardArcSeconds[0] > 0, 'nose towards target is tracked');
const distant = inspectTrajectory({
  trajectory: [frame(0, -1800, 0), frame(0.8, -1600, 0), frame(1.6, -1400, 0),
    frame(2.4, -1600, 0)],
});
assert.equal(distant.passages, 0, 'distant range reversals are not passages');
const spinning = inspectTrajectory({
  trajectory: [frame(0, 0, 0), frame(0.8, 0, 0, 1), frame(1.6, 0, 0, 2)],
});
assert(spinning.lowSpeedTurningSeconds[0] > 1, 'turning without displacement is detected');
assert.equal(spinning.passages, 0);
console.log('PASS trajectory diagnostics detect close encounters and stationary turning');
