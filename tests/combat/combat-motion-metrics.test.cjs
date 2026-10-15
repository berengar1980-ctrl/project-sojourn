'use strict';
const assert = require('node:assert/strict');
const { createMotionMetrics } = require('../../scripts/combat-motion-metrics.cjs');

function frame(time, ax, bx, av = 0, bv = 0) {
  return {
    elapsedSeconds: time,
    attacker: {
      position: { x: ax, y: 100 },
      velocity: { x: av, y: 0 },
      speed: Math.abs(av),
      headingRadians: 0,
    },
    defender: {
      position: { x: bx, y: 100 },
      velocity: { x: bv, y: 0 },
      speed: Math.abs(bv),
      headingRadians: Math.PI,
    },
  };
}

const stopped = createMotionMetrics([100, 100]);
for (let time = 0; time <= 12; time += 1) stopped.sample(frame(time, 100, 200));
const slow = stopped.summarize();
assert.equal(slow.durationSeconds, 12);
assert.equal(slow.secondsBothShipsSlow, 12);
assert.equal(slow.longestBothSlowStreakSeconds, 12);
assert(slow.secondsNearlyFixedRange >= 10);
assert.equal(slow.invalidFrames, 0);

const moving = createMotionMetrics([100, 100]);
moving.sample(frame(0, 100, 450, 80, -80));
moving.sample(frame(1, 200, 350, 80, -80));
moving.sample(frame(2, 300, 250, 80, -80));
moving.sample(frame(3, 400, 150, 80, -80));
const pass = moving.summarize();
assert.equal(pass.secondsBothShipsSlow, 0);
assert.equal(pass.invalidFrames, 0);
assert(pass.meanRelativeSpeedMetersPerSecond > 150);
assert(pass.closePassCandidates >= 1);

const invalid = createMotionMetrics([100, 100]);
invalid.sample(frame(0, 0, 100));
invalid.sample(frame(0, 0, 100));
assert.equal(invalid.summarize().invalidFrames, 1);
console.log('PASS combat motion metrics detect immobility and close-passing motion');
