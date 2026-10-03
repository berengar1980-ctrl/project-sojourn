import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointToSegmentDistance(point: WorldPoint, start: WorldPoint, end: WorldPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  return distance(point, {
    x: start.x + dx * projection,
    y: start.y + dy * projection,
  });
}

function obstacleWaypoint(
  ship: LocalShipState,
  destination: WorldPoint,
  obstacle: LocalAsteroid,
  clearance: number
): WorldPoint {
  const dx = destination.x - ship.position.x;
  const dy = destination.y - ship.position.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicular = { x: -dy / length, y: dx / length };
  const offset = obstacle.radius + clearance;
  const left = {
    x: obstacle.position.x + perpendicular.x * offset,
    y: obstacle.position.y + perpendicular.y * offset,
  };
  const right = {
    x: obstacle.position.x - perpendicular.x * offset,
    y: obstacle.position.y - perpendicular.y * offset,
  };
  const leftCost = distance(ship.position, left) + distance(left, destination);
  const rightCost = distance(ship.position, right) + distance(right, destination);
  return leftCost <= rightCost ? left : right;
}

export function findApproachWaypoint(
  ship: LocalShipState,
  destination: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  targetId: string,
  shipClearance: number
): WorldPoint {
  let blocker: LocalAsteroid | null = null;
  let blockerDistance = Number.POSITIVE_INFINITY;

  for (const asteroid of asteroids) {
    if (asteroid.id === targetId) continue;
    const clearance = asteroid.radius + shipClearance + 18;
    if (pointToSegmentDistance(asteroid.position, ship.position, destination) >= clearance)
      continue;

    const currentDistance = distance(ship.position, asteroid.position);
    if (currentDistance < blockerDistance) {
      blocker = asteroid;
      blockerDistance = currentDistance;
    }
  }

  if (!blocker) return destination;
  return obstacleWaypoint(ship, destination, blocker, shipClearance + 28);
}
