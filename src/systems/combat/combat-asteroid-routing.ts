import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';

const ROUTE_REFRESH_SECONDS = 0.75;
const REACHED_WAYPOINT_METERS = 65;

// Local steering for combat: bounded obstacle checks instead of a full grid A*.
const MAX_DETOUR_HOPS = 5;

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
    const t = Math.max(
      0,
      Math.min(
        1,
        ((rock.position.x - start.x) * dx + (rock.position.y - start.y) * dy) / lengthSquared
      )
    );
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
  const clearanceRadius = rock.radius + clearance + 35;
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
    const t = Math.max(
      0,
      Math.min(
        1,
        ((rock.position.x - start.x) * dx + (rock.position.y - start.y) * dy) / lengthSquared
      )
    );
    const x = start.x + t * dx - rock.position.x;
    const y = start.y + t * dy - rock.position.y;
    return x * x + y * y < (rock.radius + clearance) ** 2;
  });
}

/** Reuse the campaign's grid navigation, recomputing as asteroids drift. */
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
  if (!immediateThreat && !pathBlocked(ship.position, target, arena, clearance)) {
    ship.asteroidRoute = [];
    return null;
  }
  ship.nextAsteroidRouteAt = Math.max(0, (ship.nextAsteroidRouteAt ?? 0) - deltaSeconds);
  if (ship.nextAsteroidRouteAt <= 0) {
    ship.asteroidRoute = fastCombatRoute(ship.position, target, arena, clearance);
    ship.nextAsteroidRouteAt = ROUTE_REFRESH_SECONDS;
  }
  const route = ship.asteroidRoute ?? [];
  while (route.length > 0) {
    const waypoint = route[0]!;
    if (
      Math.hypot(ship.position.x - waypoint.x, ship.position.y - waypoint.y) >
      Math.max(
        32,
        Math.min(REACHED_WAYPOINT_METERS, (ship.setup.shieldGeometry?.radiusX ?? 30) * 1.5)
      )
    )
      break;
    route.shift();
  }
  const waypoint = route[0];
  if (!waypoint) return null;
  // A temporarily blocked waypoint is handled at the next scheduled refresh.
  // Forcing zero here caused a full replan on every simulation frame.
  // If an asteroid drifts across the current waypoint corridor, steer around
  // its nearer flank until the next scheduled route refresh. No grid search.
  const steeringPoint = pathBlocked(ship.position, waypoint, arena, clearance)
    ? (detourPoint(ship.position, waypoint, arena, clearance) ?? waypoint)
    : waypoint;
  const dx = steeringPoint.x - ship.position.x;
  const dy = steeringPoint.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  return distance > 0.001 ? { x: dx / distance, y: dy / distance } : null;
}
