'use strict';

// Pure analysis of recorded trajectories; does not alter combat decisions.
// Sampled points are 0.8s apart, so short passages and fast spins may be missed.
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const round = (value) => Number(value.toFixed(3));

function inspectTrajectory(entry) {
  const frames = entry.trajectory;
  const metrics = {
    passages: 0,
    approachAndRecede: 0,
    suspectedOrbitCycles: 0,
    lowSpeedTurningSeconds: [0, 0],
    rotationRadians: [0, 0],
    forwardArcSeconds: [0, 0],
    broadsideArcSeconds: [0, 0],
    observedSeconds: 0,
    minimumObservedSeparation: Infinity,
  };
  let passArmed = true;
  let approaching = false;
  let orbitAngle = 0;
  let closestInApproach = Infinity;
  for (let i = 1; i < frames.length; i += 1) {
    const previous = frames[i - 1];
    const frame = frames[i];
    const dt = frame.t - previous.t;
    if (dt <= 0) continue;
    const separation = distance(frame.a, frame.b);
    const earlierSeparation = distance(previous.a, previous.b);
    metrics.minimumObservedSeparation = Math.min(metrics.minimumObservedSeparation, separation);
    metrics.observedSeconds += dt;
    if (separation < earlierSeparation - 1) {
      approaching = true;
      closestInApproach = Math.min(closestInApproach, separation);
    }
    if (approaching && separation > earlierSeparation + 1) {
      metrics.approachAndRecede += 1;
      // A narrow encounter with both closing and opening motion is a proximity
      // passage candidate, not proof that hulls crossed or exchanged sides.
      if (closestInApproach < 420 && passArmed) {
        metrics.passages += 1;
        passArmed = false;
      }
      approaching = false;
      closestInApproach = Infinity;
    }
    if (separation > 550) passArmed = true;
    const beforeBearing = Math.atan2(previous.b[1] - previous.a[1], previous.b[0] - previous.a[0]);
    const afterBearing = Math.atan2(frame.b[1] - frame.a[1], frame.b[0] - frame.a[0]);
    orbitAngle += wrapAngle(afterBearing - beforeBearing);
    for (const [index, key, enemy] of [[0, 'a', 'b'], [1, 'b', 'a']]) {
      const turn = Math.abs(wrapAngle(frame[key][2] - previous[key][2]));
      const moved = distance(frame[key], previous[key]);
      metrics.rotationRadians[index] += turn;
      if (moved / dt < 5 && turn / dt > 0.2) metrics.lowSpeedTurningSeconds[index] += dt;
      const bearing = Math.atan2(frame[enemy][1] - frame[key][1], frame[enemy][0] - frame[key][0]);
      const difference = Math.abs(wrapAngle(bearing - frame[key][2]));
      if (difference <= Math.PI / 6) metrics.forwardArcSeconds[index] += dt;
      if (Math.abs(difference - Math.PI / 2) <= Math.PI / 6)
        metrics.broadsideArcSeconds[index] += dt;
    }
  }
  metrics.suspectedOrbitCycles = Math.floor(Math.abs(orbitAngle) / (2 * Math.PI));
  if (!Number.isFinite(metrics.minimumObservedSeparation)) metrics.minimumObservedSeparation = null;
  for (const field of ['lowSpeedTurningSeconds', 'rotationRadians', 'forwardArcSeconds', 'broadsideArcSeconds'])
    metrics[field] = metrics[field].map(round);
  metrics.observedSeconds = round(metrics.observedSeconds);
  if (metrics.minimumObservedSeparation !== null)
    metrics.minimumObservedSeparation = round(metrics.minimumObservedSeparation);
  return metrics;
}

module.exports = { inspectTrajectory };
