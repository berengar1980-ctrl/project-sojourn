'use strict';

// Read-only metrics for consecutive StrategicCombatSnapshot-compatible frames.
function createMotionMetrics(maxSpeeds) {
  const floor = maxSpeeds.map((speed) => Math.max(0, speed) * 0.15);
  let previous = null;
  let slowStreak = 0;
  let longestSlow = 0;
  let secondsSlow = 0;
  let secondsLowRelative = 0;
  let duration = 0;
  let relativeIntegral = 0;
  let passes = 0;
  let lastPass = -100;
  let minimum = Infinity;
  let maximum = 0;
  let invalidFrames = 0;
  let windowStart = null;
  let windowMin = Infinity;
  let windowMax = 0;
  let fixedRangeSeconds = 0;

  function sample(frame) {
    const a = frame.attacker;
    const b = frame.defender;
    const range = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    const relative = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
    const valid = [
      frame.elapsedSeconds,
      range,
      relative,
      a.speed,
      b.speed,
      a.headingRadians,
      b.headingRadians,
    ].every(Number.isFinite);
    if (!valid) {
      invalidFrames += 1;
      return;
    }
    minimum = Math.min(minimum, range);
    maximum = Math.max(maximum, range);
    if (windowStart === null) windowStart = frame.elapsedSeconds;
    windowMin = Math.min(windowMin, range);
    windowMax = Math.max(windowMax, range);
    if (frame.elapsedSeconds - windowStart >= 10) {
      if (windowMax - windowMin < 75) fixedRangeSeconds += frame.elapsedSeconds - windowStart;
      windowStart = frame.elapsedSeconds;
      windowMin = range;
      windowMax = range;
    }
    if (previous) {
      const dt = frame.elapsedSeconds - previous.time;
      if (dt <= 0 || !Number.isFinite(dt)) {
        invalidFrames += 1;
      } else {
        duration += dt;
        relativeIntegral += relative * dt;
        if (a.speed < floor[0] && b.speed < floor[1]) {
          secondsSlow += dt;
          slowStreak += dt;
          longestSlow = Math.max(longestSlow, slowStreak);
        } else {
          slowStreak = 0;
        }
        if (relative < 15) secondsLowRelative += dt;
        const trend = range - previous.range;
        if (
          previous.trend < -0.4 &&
          trend > 0.4 &&
          range < 600 &&
          relative > 30 &&
          frame.elapsedSeconds - lastPass >= 2
        ) {
          passes += 1;
          lastPass = frame.elapsedSeconds;
        }
      }
    }
    previous = {
      time: frame.elapsedSeconds,
      range,
      trend: previous ? range - previous.range : 0,
    };
  }

  function summarize() {
    const round = (value) => Number(value.toFixed(2));
    return {
      durationSeconds: round(duration),
      minimumSeparationMeters: Number.isFinite(minimum) ? round(minimum) : null,
      maximumSeparationMeters: round(maximum),
      secondsBothShipsSlow: round(secondsSlow),
      longestBothSlowStreakSeconds: round(longestSlow),
      secondsLowRelativeSpeed: round(secondsLowRelative),
      secondsNearlyFixedRange: round(fixedRangeSeconds),
      closePassCandidates: passes,
      meanRelativeSpeedMetersPerSecond: round(duration ? relativeIntegral / duration : 0),
      invalidFrames,
    };
  }

  return { sample, summarize };
}

module.exports = { createMotionMetrics };
