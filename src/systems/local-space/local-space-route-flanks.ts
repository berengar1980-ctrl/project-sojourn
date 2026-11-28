import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import {
  clampedSegmentProjection,
  distance,
  pointToSegmentDistanceSquared,
} from '../../core/field-geometry';
import { localAsteroidContactRadius } from './local-asteroid-footprint';

export type RouteObstacle = Pick<
  LocalAsteroid,
  'id' | 'position' | 'radius' | 'collisionRadius' | 'routeBlocking'
> & { readonly velocity?: WorldPoint };

const MAX_FAST_ROUTE_HOPS = 10;
const FAST_ROUTE_EDGE_MARGIN = 55;

export function routeSegmentClear(
  start: WorldPoint,
  end: WorldPoint,
  obstacles: readonly RouteObstacle[],
  clearance: number
): boolean {
  return obstacles.every((obstacle) => {
    if (!obstacle.routeBlocking) return true;
    const radius = localAsteroidContactRadius(obstacle) + clearance;
    return pointToSegmentDistanceSquared(obstacle.position, start, end) >= radius * radius;
  });
}

/** One PvP two-flank waypoint, shared by committed combat routes and field routing. */
export function planFlankWaypoint(
  start: WorldPoint,
  target: WorldPoint,
  obstacles: readonly RouteObstacle[],
  clearance: number,
  width: number,
  height: number
): WorldPoint | null {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);
  let nearest = Infinity;
  let blocker: RouteObstacle | undefined;
  for (const obstacle of obstacles) {
    const t = clampedSegmentProjection(obstacle.position, start, dx, dy, lengthSquared);
    const offsetX = start.x + dx * t - obstacle.position.x;
    const offsetY = start.y + dy * t - obstacle.position.y;
    const radius = localAsteroidContactRadius(obstacle) + clearance;
    if (
      !obstacle.routeBlocking ||
      offsetX * offsetX + offsetY * offsetY >= radius * radius ||
      t >= nearest
    )
      continue;
    nearest = t;
    blocker = obstacle;
  }
  if (!blocker) return null;

  const length = Math.max(1, Math.hypot(dx, dy));
  const flankRadius = (localAsteroidContactRadius(blocker) + clearance + 35) * 1.5;
  const candidates = [1, -1].map((sign) => ({
    x: Math.max(
      FAST_ROUTE_EDGE_MARGIN,
      Math.min(
        width - FAST_ROUTE_EDGE_MARGIN,
        blocker!.position.x - ((sign * dy) / length) * flankRadius
      )
    ),
    y: Math.max(
      FAST_ROUTE_EDGE_MARGIN,
      Math.min(
        height - FAST_ROUTE_EDGE_MARGIN,
        blocker!.position.y + ((sign * dx) / length) * flankRadius
      )
    ),
  }));
  return (
    candidates
      .map((point) => ({
        point,
        score:
          (routeSegmentClear(start, point, obstacles, clearance) ? 0 : 100000) +
          (routeSegmentClear(point, target, obstacles, clearance) ? 0 : 1000) +
          distance(start, point) +
          distance(point, target),
      }))
      .sort((left, right) => left.score - right.score)[0]?.point ?? null
  );
}

export function fastFlankRoute(
  start: WorldPoint,
  target: WorldPoint,
  obstacles: readonly RouteObstacle[],
  clearance: number,
  width: number,
  height: number
): readonly WorldPoint[] | null {
  const route: WorldPoint[] = [start];
  let current = start;
  for (let hop = 0; hop < MAX_FAST_ROUTE_HOPS; hop += 1) {
    const waypoint = planFlankWaypoint(current, target, obstacles, clearance, width, height);
    if (!waypoint) return [...route, target];
    if (distance(current, waypoint) < 15) return null;
    route.push(waypoint);
    current = waypoint;
  }
  return null;
}
