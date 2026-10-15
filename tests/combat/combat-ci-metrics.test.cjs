'use strict';

const assert = require('node:assert/strict');
const { summarizeMotion, formatMotionStatus } = require('../../scripts/combat-ci-metrics.cjs');
const scenarios = [
  {
    label: 'front',
    seed: 100,
    steeringPath: 'unified',
    durationSeconds: 90,
    secondsBothShipsSlow: 9,
    longestBothSlowStreakSeconds: 6,
    meanRelativeSpeedMetersPerSecond: 60,
    closePassCandidates: 2,
    invalidFrames: 0,
    winner: null,
  },
  {
    label: 'front',
    seed: 101,
    steeringPath: 'unified',
    durationSeconds: 90,
    secondsBothShipsSlow: 18,
    longestBothSlowStreakSeconds: 8,
    meanRelativeSpeedMetersPerSecond: 80,
    closePassCandidates: 1,
    invalidFrames: 0,
    winner: 'attacker',
  },
];
const groups = summarizeMotion(scenarios);
assert.equal(groups.length, 1);
assert.equal(groups[0].cases, 2);
assert.equal(groups[0].slowPercent, 15);
assert.equal(groups[0].longestStallSeconds, 8);
assert.equal(groups[0].meanRelativeSpeed, 70);
assert.equal(groups[0].closePassCandidates, 3);
assert.equal(groups[0].winners, 1);
assert.equal(groups[0].allUnified, true);
assert(formatMotionStatus(groups[0]).includes('slow 15.0%'));
console.log('PASS CI combat-motion summaries preserve seeded progress metrics');
