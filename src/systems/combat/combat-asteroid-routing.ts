import { clampedSegmentProjection } from '../../core/field-geometry';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';

const ROUTE_REFRESH_SECONDS = 0.75;
const TARGET_DRIFT_METERS = 150;
const REACHED_WAYPOINT_METERS = 65;

// Local steering for combat: bounded obstacle checks instead of a full grid A*.
const MAX_DETOUR_HOPS = 10;

function nearestBlocker(
  start: CombatPoint,
  end: CombatPoint,
  arena: StrategicCombatArenaOptions,
  clearance: number
): NonNullable<StrategicCombatArenaOptions['obstacles']>[number] | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);
  let nearest = Infinity;
  let blocker: NonNullable<StrategicCombatArenaOptions['obstacles']>[number] | null = null;
  for (const rock of arena.obstacles ?? []) {
    const t = clampedSegmentProjection(rock.position, start, dx, dy, lengthSquared);
    const offsetX = start.x + dx * t - rock.position.x;
    const offsetY = start.y + dy * t - rock.position.y;
    if (offsetX * offsetX + offsetY * offsetY >= (rock.radius + clearance) ** 2 || t >= nearest)
      continue;
    nearest = t;
    blocker = rock;
  }
  return blocker;
}

function detourPoint(
  start: CombatPoint,
  end: CombatPoint,
  arena: StrategicCombatArenaOptions,
  clearance: number
): CombatPoint | null {
  const rock = nearestBlocker(start, end, arena, clearance);
  if (!rock) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const clearanceRadius = (rock.radius + clearance + 35) * 1.5;
  const candidates = [1, -1].map((sign) => ({
    x: Math.max(
      EDGE_MARGIN,
      Math.min(
        arena.width - EDGE_MARGIN,
        rock.position.x - ((sign * dy) / length) * clearanceRadius
      )
    ),
    y: Math.max(
      EDGE_MARGIN,
      Math.min(
        arena.height - EDGE_MARGIN,
        rock.position.y + ((sign * dx) / length) * clearanceRadius
      )
    ),
  }));
  // Prefer a collision-free first leg; consider the target leg as a tie breaker.
  candidates.sort((left, right) => {
    const score = (point: CombatPoint): number =>
      (pathBlocked(start, point, arena, clearance) ? 100000 : 0) +
      (pathBlocked(point, end, arena, clearance) ? 1000 : 0) +
      Math.hypot(point.x - start.x, point.y - start.y) +
      Math.hypot(end.x - point.x, end.y - point.y);
    return score(left) - score(right);
  });
  return candidates[0] ?? null;
}

const EDGE_MARGIN = 55;

function fastCombatRoute(
  start: CombatPoint,
  end: CombatPoint,
  arena: StrategicCombatArenaOptions,
  clearance: number
): CombatPoint[] {
  const route: CombatPoint[] = [];
  let position = start;
  for (let hop = 0; hop < MAX_DETOUR_HOPS; hop += 1) {
    const waypoint = detourPoint(position, end, arena, clearance);
    if (!waypoint) break;
    if (Math.hypot(position.x - waypoint.x, position.y - waypoint.y) < 15) break;
    route.push(waypoint);
    position = waypoint;
  }
  route.push(end);
  return route;
}

function pathBlocked(
  start: CombatPoint,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  clearance: number
): boolean {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);
  return (arena.obstacles ?? []).some((rock) => {
    const t = clampedSegmentProjection(rock.position, start, dx, dy, lengthSquared);
    const x = start.x + t * dx - rock.position.x;
    const y = start.y + t * dy - rock.position.y;
    return x * x + y * y < (rock.radius + clearance) ** 2;
  });
}

/** Flight-route memory is shared; only escape keeps a committed rock flank. */
function selectRouteWaypoint(
  ship: MutableCombatant,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  clearance: number,
  deltaSeconds: number,
  immediateThreat: boolean
): CombatPoint | null {
  const blocked = pathBlocked(ship.position, target, arena, clearance);
  const fleeing = ship.tactic === 'flee';
  if (!fleeing && !immediateThreat && !blocked) {
    ship.asteroidRoute = [];
    return null;
  }
  const route = ship.asteroidRoute ?? [];
  const reached = Math.max(
    32,
    Math.min(REACHED_WAYPOINT_METERS, (ship.setup.shieldGeometry?.radiusX ?? 30) * 1.5)
  );
  while (
    route.length &&
    Math.hypot(ship.position.x - route[0]!.x, ship.position.y - route[0]!.y) <= reached
  ) {
    route.shift();
  }
  ship.nextAsteroidRouteAt = Math.max(0, (ship.nextAsteroidRouteAt ?? 0) - deltaSeconds);
  // The current obstacle flank is a committed waypoint, not a suggestion
  // to replace every 750 ms. Replan only if the destination actually moves,
  // a new rock obstructs the next leg, or the route is exhausted.
  const oldTarget = route.at(-1);
  let targetDrift = Infinity;
  if (oldTarget) {
    targetDrift = Math.hypot(oldTarget.x - target.x, oldTarget.y - target.y);
  }
  const staleLeg = route.length > 0 && pathBlocked(ship.position, route[0]!, arena, clearance);
  const needRefresh =
    !fleeing &&
    ship.nextAsteroidRouteAt <= 0 &&
    (targetDrift > TARGET_DRIFT_METERS || (staleLeg && immediateThreat));
  const replan = !route.length || needRefresh;
  if (replan) {
    ship.asteroidRoute = fastCombatRoute(ship.position, target, arena, clearance);
    ship.nextAsteroidRouteAt = ROUTE_REFRESH_SECONDS;
  }
  return ship.asteroidRoute?.[0] ?? null;
}

/** Bounded local obstacle routing with a committed flank for each ship. */
export function combatRouteHeading(
  ship: MutableCombatant,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  deltaSeconds: number
): CombatPoint | null {
  if (!arena.obstacles?.length) return null;
  const clearance = Math.max(25, ship.setup.shieldGeometry?.radiusY ?? 30) + 14;
  const prediction = {
    x: ship.position.x + ship.velocity.x * 2,
    y: ship.position.y + ship.velocity.y * 2,
  };
  const immediateThreat = pathBlocked(ship.position, prediction, arena, clearance + 35);
  const waypoint = selectRouteWaypoint(
    ship,
    target,
    arena,
    clearance,
    deltaSeconds,
    immediateThreat
  );
  if (!waypoint) return null;
  // No per-frame emergency flank reversal during retreat: a flight waypoint
  // is committed until reached. Ordinary combat can still dodge drifting rocks.
  let steeringPoint = waypoint;
  if (
    ship.tactic !== 'flee' &&
    immediateThreat &&
    pathBlocked(ship.position, waypoint, arena, clearance)
  ) {
    steeringPoint = detourPoint(ship.position, waypoint, arena, clearance) ?? waypoint;
  }
  const dx = steeringPoint.x - ship.position.x;
  const dy = steeringPoint.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  return distance > 0.001 ? { x: dx / distance, y: dy / distance } : null;
}
