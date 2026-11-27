import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { measurePerformance } from '../../core/performance-diagnostics';
import { planPointRoute } from '../local-space/local-space-navigation';
import { planFieldPatrolRoute } from './field-patrol-route';

export interface FieldRouteObstacle {
  readonly id: string;
  readonly position: WorldPoint;
  readonly radius: number;
}

/** The active route is part of the ship's checkpoint, not hidden in a WeakMap. */
export interface FieldRouteState {
  readonly target: WorldPoint;
  readonly points: readonly WorldPoint[];
  index: number;
}

export interface FieldRouteShip {
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  routeState?: FieldRouteState;
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function blocked(
  start: WorldPoint,
  target: WorldPoint,
  obstacle: FieldRouteObstacle,
  clearance: number
): boolean {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1) return false;
  const dot = (obstacle.position.x - start.x) * dx + (obstacle.position.y - start.y) * dy;
  const t = Math.max(0, Math.min(1, dot / lengthSq));
  const gap = Math.hypot(
    start.x + dx * t - obstacle.position.x,
    start.y + dy * t - obstacle.position.y
  );
  return gap < obstacle.radius + clearance;
}

function makeRoute(
  start: WorldPoint,
  target: WorldPoint,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number,
  mode: 'grid' | 'patrol'
): readonly WorldPoint[] {
  if (mode === 'patrol') return planFieldPatrolRoute(start, target, obstacles, clearance);
  if (!obstacles.some((rock) => blocked(start, target, rock, clearance))) return [target];

  // Use the native campaign/PvP field planner rather than ad-hoc flank picking.
  // RouteBlocking and contact radius are the only obstacle fields used by it.
  let maxX = Math.max(start.x, target.x);
  let maxY = Math.max(start.y, target.y);
  const rocks = obstacles.map((rock) => {
    maxX = Math.max(maxX, rock.position.x);
    maxY = Math.max(maxY, rock.position.y);
    return {
      ...rock,
      routeBlocking: true,
      collisionRadius: rock.radius,
    };
  }) as unknown as LocalAsteroid[];
  const planned = planPointRoute({
    start,
    target,
    asteroids: rocks,
    clearance,
    width: Math.max(4400, maxX + 250),
    height: Math.max(2700, maxY + 250),
  });
  // Never accept the planner's straight-line fallback through a solid body.
  if (planned.compromised) {
    const safe = planned.route.every((point, index) => {
      if (index === 0) return true;
      const before = planned.route[index - 1]!;
      return !obstacles.some((rock) => blocked(before, point, rock, 0));
    });
    if (!safe) return [];
  }
  return planned.route.slice(1);
}

/** Returns a checkpointed waypoint on a safe route to the work target. */
export function fieldRouteTarget(
  ship: FieldRouteShip,
  target: WorldPoint,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number,
  mode: 'grid' | 'patrol' = 'grid'
): WorldPoint | null {
  const saved = ship.routeState;
  // A ship or drifting obstacle may have entered an already planned route.
  // Invalidate the checkpointed path before attempting to move through it.
  if (saved) {
    const nextWaypoint = saved.points[saved.index] ?? target;
    // A close route corner must be completed before recomputing it. Otherwise
    // drifting asteroid clearance halos force a new 5-10 m detour each tick
    // and a miner can circle forever without reaching its work target.
    const establishedCorner = distance(ship.position, nextWaypoint) <= 24;
    if (
      !establishedCorner &&
      obstacles.some((obstacle) => blocked(ship.position, nextWaypoint, obstacle, clearance))
    )
      delete ship.routeState;
  }
  const current = ship.routeState;
  if (!current || distance(current.target, target) > 1 || current.index >= current.points.length) {
    const points = measurePerformance('sim.field.route-search', () =>
      makeRoute(ship.position, target, obstacles, clearance, mode)
    );
    if (points.length === 0) {
      delete ship.routeState;
      return null;
    }
    ship.routeState = { target: { ...target }, points, index: 0 };
  }
  const route = ship.routeState;
  return route?.points[route.index] ?? null;
}

export function moveFieldShip(
  ship: FieldRouteShip,
  target: WorldPoint,
  speed: number,
  dt: number,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number,
  mode: 'grid' | 'patrol' = 'grid'
): boolean {
  const waypoint = fieldRouteTarget(ship, target, obstacles, clearance, mode);
  if (!waypoint) {
    ship.speed = 0;
    return false;
  }
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const remaining = Math.hypot(dx, dy);
  const step = Math.max(0, speed) * Math.max(0, dt);
  ship.headingRadians = Math.atan2(dy, dx);
  if (remaining <= Math.max(2, step)) {
    ship.position = { ...waypoint };
    ship.speed = 0;
    const route = ship.routeState!;
    route.index += 1;
    if (route.index >= route.points.length) {
      delete ship.routeState;
      return distance(ship.position, target) < 2;
    }
    return false;
  }
  ship.position = {
    x: ship.position.x + (dx / remaining) * step,
    y: ship.position.y + (dy / remaining) * step,
  };
  ship.speed = speed;
  return false;
}
