'use strict';
const assert = require('node:assert/strict');
const { createEngagementMetrics } = require('../../scripts/combat-engagement-metrics.cjs');
const forward = {
  weapons: [{ weapon: { rangeMeters: 400, mount: 'forward' } }],
  weaponMounts: [{ slotIndex: 0, x: 0, y: 0, facing: 'forward' }],
};
function frame(seconds, firstHeading, separation) {
  return {
    elapsedSeconds: seconds,
    attacker: {
      position: { x: 100, y: 100 },
      headingRadians: firstHeading,
      strategy: { phase: 'fire' },
    },
    defender: {
      position: { x: 100 + separation, y: 100 },
      headingRadians: Math.PI,
      strategy: { phase: 'reach_range' },
    },
  };
}
function inArc(actor, target) {
  const bearing = Math.atan2(target.y - actor.position.y, target.x - actor.position.x);
  return Math.cos(bearing - actor.headingRadians) > 0.8;
}
const monitor = createEngagementMetrics([forward, forward], inArc);
monitor.sample(frame(0, 0, 200));
monitor.sample(frame(1, Math.PI / 2, 200));
monitor.sample(frame(2, 0, 200));
monitor.sample(frame(3, 0, 500));
const result = monitor.summarize();
assert.equal(result.attackerWeaponRangeSeconds, 2);
assert.equal(result.defenderWeaponRangeSeconds, 2);
assert.equal(result.attackerWeaponArcSeconds, 1);
assert.equal(result.defenderWeaponArcSeconds, 2);
assert.equal(result.attackerFirePhaseSeconds, 3);
assert.equal(result.defenderFirePhaseSeconds, 0);
console.log('PASS engagement diagnosis separates weapon range from actual firing arc');
