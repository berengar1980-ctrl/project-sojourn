import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { localAsteroidContactRadius } from './local-asteroid-footprint';

export interface PredictedAsteroidHazard {
  readonly asteroid: LocalAsteroid;
  readonly predictedPosition: WorldPoint;
  readonly timeToCrossing: number;
}

/** Predict the moving rock where the autopilot will cross its line, not only where it is now. */
export function findRouteAsteroidHazard(
  ship: LocalShipState,
  waypoint: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  clearance: number,
  cruiseSpeed: number,
  excludedId: string | null = null
): PredictedAsteroidHazard | null {
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const length2 = dx * dx + dy * dy;
  if (length2 < 16) return null;
  let best: PredictedAsteroidHazard | null = null;
  let bestGap = Infinity;
  const segmentLength = Math.sqrt(length2);
  const speed = Math.max(18, cruiseSpeed);
  for (const asteroid of asteroids) {
    if (!asteroid.routeBlocking || asteroid.id === excludedId) continue;
    // Two predictive iterations track a rock crossing the line while our ship approaches.
    let projection = Math.max(0, Math.min(1,
      ((asteroid.position.x - ship.position.x) * dx +
        (asteroid.position.y - ship.position.y) * dy) / length2
    ));
    let seconds = Math.min(4.5, segmentLength * projection / speed);
    let predicted: WorldPoint = {
      x: asteroid.position.x + asteroid.physics.velocity.x * seconds,
      y: asteroid.position.y + asteroid.physics.velocity.y * seconds,
    };
    projection = Math.max(0, Math.min(1,
      ((predicted.x - ship.position.x) * dx +
        (predicted.y - ship.position.y) * dy) / length2
    ));
    seconds = Math.min(4.5, segmentLength * projection / speed);
    predicted = {
      x: asteroid.position.x + asteroid.physics.velocity.x * seconds,
      y: asteroid.position.y + asteroid.physics.velocity.y * seconds,
    };
    const near = {
      x: ship.position.x + dx * projection,
      y: ship.position.y + dy * projection,
    };
    const gap = Math.hypot(predicted.x - near.x, predicted.y - near.y) -
      localAsteroidContactRadius(asteroid) - clearance;
    // The current overlap is handled by collision physics; do not teleport out of it.
    if (gap > 12 || projection < 0.025 || seconds > 4.5) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = { asteroid, predictedPosition: predicted, timeToCrossing: seconds };
    }
  }
  return best;
}

export function asteroidAvoidanceOdds(pilotingSkill: number, sensorSkill: number, seconds: number) {
  const normalize = (skill: number) => Math.max(0, Math.min(100, skill)) / 100;
  const warning = Math.max(0.35, Math.min(1, seconds / 2));
  return {
    detect: Math.min(0.94, (0.12 + normalize(sensorSkill) * 0.82) * warning),
    react: Math.min(0.94, (0.06 + normalize(pilotingSkill) * 0.88) * warning),
  };
}

/** Both crew stations must pass independently; only one check is allowed per obstruction. */
export function crewAvoidsAsteroid(
  pilotingSkill: number,
  sensorSkill: number,
  seconds: number,
  random: () => number
): boolean {
  const odds = asteroidAvoidanceOdds(pilotingSkill, sensorSkill, seconds);
  return random() < odds.detect && random() < odds.react;
}
