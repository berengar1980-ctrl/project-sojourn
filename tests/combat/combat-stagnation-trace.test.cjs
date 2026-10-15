'use strict';
const assert = require('node:assert/strict');
const { createStagnationTrace } = require('../../scripts/combat-stagnation-trace.cjs');

function snapshot(time, range, speed) {
  return {
    elapsedSeconds: time,
    attacker: {
      position: { x: 400, y: 200 },
      velocity: { x: speed, y: 0 },
      speed,
      headingRadians: 0,
      tactic: 'fight',
      strategy: { kind: 'frontal', phase: 'fire', desiredRange: 400 },
      subsystems: { engine: 100 },
    },
    defender: {
      position: { x: 400 + range, y: 200 },
      velocity: { x: 0, y: 0 },
      speed: 0,
      headingRadians: Math.PI,
      tactic: 'fight',
      strategy: { kind: 'broadside', phase: 'reach_range', desiredRange: 400 },
      subsystems: { engine: 100 },
    },
  };
}

const trace = createStagnationTrace([100, 100]);
for (let time = 0; time <= 12; time += 0.5) {
  trace.observe(snapshot(time, 86, time < 2 ? 80 : 0));
}
const report = trace.summarize([
  { timeSeconds: 6, side: 'attacker', event: 'phase', detail: 'fire' },
  { timeSeconds: 40, side: 'system', event: 'result', detail: 'ignored' },
]);
assert.equal(report.firstSustainedSlowStartSeconds, 2);
assert.equal(report.secondsNear86mContact, 12);
assert(report.secondsNear86mAndBothSlow >= 9.5);
assert.equal(report.motion[0].separationMeters, 86);
assert.equal(report.motion[0].attacker.doctrine, 'frontal');
assert(report.nearbyEvents.some((entry) => entry.detail === 'fire'));
assert(!report.nearbyEvents.some((entry) => entry.detail === 'ignored'));

const mobile = createStagnationTrace([100, 100]);
for (let time = 0; time <= 12; time += 1) {
  mobile.observe(snapshot(time, 200 + time * 50, 80));
}
const clear = mobile.summarize([]);
assert.equal(clear.firstSustainedSlowStartSeconds, null);
assert.equal(clear.secondsNear86mContact, 0);
assert(clear.motion.length > 0);
console.log('PASS read-only stagnation trace captures onset and collision-band dwell');
