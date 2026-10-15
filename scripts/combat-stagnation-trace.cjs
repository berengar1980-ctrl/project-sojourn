'use strict';

// Snapshot-only instrumentation. Does not issue commands or mutate combatants.
function createStagnationTrace(maxSpeeds) {
  const thresholds = maxSpeeds.map((speed) => speed * 0.15);
  const samples = [];
  let previousTime = null;
  let sampledSecond = -1;
  let slowStreak = 0;
  let slowStart = null;
  let firstStall = null;
  let contactSeconds = 0;
  let contactSlowSeconds = 0;

  function observe(frame) {
    const { attacker, defender, elapsedSeconds: time } = frame;
    const dx = defender.position.x - attacker.position.x;
    const dy = defender.position.y - attacker.position.y;
    const range = Math.hypot(dx, dy);
    const relativeX = attacker.velocity.x - defender.velocity.x;
    const relativeY = attacker.velocity.y - defender.velocity.y;
    const relativeSpeed = Math.hypot(relativeX, relativeY);
    const closingSpeed = range > 0 ? (relativeX * dx + relativeY * dy) / range : 0;
    const slow = attacker.speed < thresholds[0] && defender.speed < thresholds[1];
    const atContact = range >= 85.5 && range <= 87;
    const dt = previousTime === null ? 0 : Math.max(0, time - previousTime);
    previousTime = time;

    if (slow) {
      if (slowStart === null) slowStart = time;
      slowStreak = time - slowStart;
    } else {
      slowStart = null;
      slowStreak = 0;
    }
    if (atContact) contactSeconds += dt;
    if (atContact && slow) contactSlowSeconds += dt;
    if (firstStall === null && slowStreak >= 4 && time >= 6) {
      firstStall = slowStart;
    }

    const second = Math.floor(time + 0.00001);
    if (second <= sampledSecond) return;
    sampledSecond = second;
    const shipState = (ship) => ({
      x: Number(ship.position.x.toFixed(1)),
      y: Number(ship.position.y.toFixed(1)),
      speed: Number(ship.speed.toFixed(1)),
      headingRadians: Number(ship.headingRadians.toFixed(2)),
      tactic: ship.tactic,
      doctrine: ship.strategy?.kind ?? null,
      phase: ship.strategy?.phase ?? null,
      desiredRange: ship.strategy?.desiredRange ?? null,
      engine: ship.subsystems?.engine ?? null,
      boostActive: ship.boostActive ?? false,
    });
    samples.push({
      timeSeconds: second,
      separationMeters: Number(range.toFixed(2)),
      closingSpeedMetersPerSecond: Number(closingSpeed.toFixed(2)),
      relativeSpeedMetersPerSecond: Number(relativeSpeed.toFixed(2)),
      bothSlow: slow,
      atContactBoundary: atContact,
      attacker: shipState(attacker),
      defender: shipState(defender),
    });
  }

  function summarize(log) {
    const round = (value) => Number(value.toFixed(2));
    const start = firstStall === null ? 0 : Math.max(0, firstStall - 5);
    const end = firstStall === null ? Math.min(20, previousTime ?? 0) : firstStall + 12;
    const relevant = log.filter(
      (entry) => entry.timeSeconds >= start && entry.timeSeconds <= end
    );
    return {
      firstSustainedSlowStartSeconds: firstStall === null ? null : round(firstStall),
      secondsNear86mContact: round(contactSeconds),
      secondsNear86mAndBothSlow: round(contactSlowSeconds),
      diagnosticWindow: [round(start), round(end)],
      sampleEverySeconds: 1,
      motion: samples.filter((row) => row.timeSeconds >= start && row.timeSeconds <= end),
      nearbyEvents: relevant.map((entry) => ({
        timeSeconds: entry.timeSeconds,
        side: entry.side,
        event: entry.event,
        detail: entry.detail,
      })),
    };
  }

  return { observe, summarize };
}

module.exports = { createStagnationTrace };
