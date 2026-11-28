import type { WorldPoint } from '../../core/world-types';
import {
  fastFlankRoute,
  planFlankWaypoint,
  routeSegmentClear,
  type RouteObstacle,
} from '../local-space/local-space-navigation';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';

const ROUTE_REFRESH_SECONDS = 0.75;
const TARGET_DRIFT_METERS = 150;
const REACHED_WAYPOINT_METERS = 65;
const MIN_ROUTE_PREDICTION_SECONDS = 0.4;
const MAX_ROUTE_PREDICTION_SECONDS = 3;

function brakingForecast(ship: MutableCombatant): {
  readonly seconds: number;
  readonly position: CombatPoint;
} {
  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  const acceleration = Math.max(1, ship.setup.accelerationMetersPerSecond2 ?? 36);
  const seconds = Math.max(
    MIN_ROUTE_PREDICTION_SECONDS,
    Math.min(MAX_ROUTE_PREDICTION_SECONDS, speed / acceleration)
  );
  const brakingDistance = (speed * speed) / (2 * acceleration);
  return {
    seconds,
    position:
      speed > 0
        ? {
            x: ship.position.x + (ship.velocity.x / speed) * brakingDistance,
            y: ship.position.y + (ship.velocity.y / speed) * brakingDistance,
          }
        : ship.position,
  };
}

function routeObstacles(arena: StrategicCombatArenaOptions): RouteObstacle[] {
  const bodies = new Map((arena.asteroids ?? []).map((body) => [body.id, body]));
  return (arena.obstacles ?? []).map((obstacle) => {
    const body = bodies.get(obstacle.id);
    return {
      id: obstacle.id,
      position: obstacle.position,
      radius: obstacle.radius,
      collisionRadius: obstacle.radius,
      routeBlocking: true,
      ...(body?.velocity ? { velocity: body.velocity } : {}),
    };
  });
}

function pathBlocked(
  start: CombatPoint,
  end: CombatPoint,
  obstacles: readonly RouteObstacle[],
  clearance: number,
  predictionSeconds = 0
): boolean {
  const projected =
    predictionSeconds > 0
      ? obstacles.map((obstacle) =>
          obstacle.velocity
            ? {
                ...obstacle,
                position: {
                  x: obstacle.position.x + obstacle.velocity.x * predictionSeconds,
                  y: obstacle.position.y + obstacle.velocity.y * predictionSeconds,
                },
              }
            : obstacle
        )
      : obstacles;
  return !routeSegmentClear(start, end, projected, clearance);
}

function plannedCombatRoute(
  start: CombatPoint,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  obstacles: readonly RouteObstacle[],
  clearance: number,
  predictionSeconds: number
): readonly WorldPoint[] {
  const projected =
    predictionSeconds > 0
      ? obstacles.map((obstacle) =>
          obstacle.velocity
            ? {
                ...obstacle,
                position: {
                  x: obstacle.position.x + obstacle.velocity.x * predictionSeconds,
                  y: obstacle.position.y + obstacle.velocity.y * predictionSeconds,
                },
              }
            : obstacle
        )
      : obstacles;
  return (
    fastFlankRoute(start, target, projected, clearance, arena.width, arena.height)?.slice(1) ?? []
  );
}

function shouldRefreshCombatRoute(
  ship: MutableCombatant,
  target: CombatPoint,
  route: readonly WorldPoint[],
  obstacles: readonly RouteObstacle[],
  clearance: number,
  immediateThreat: boolean
): boolean {
  if (ship.tactic === 'flee' || (ship.nextAsteroidRouteAt ?? 0) > 0) return false;
  const oldTarget = route.at(-1);
  const targetDrift = oldTarget
    ? Math.hypot(oldTarget.x - target.x, oldTarget.y - target.y)
    : Infinity;
  const staleLeg = route.length > 0 && pathBlocked(ship.position, route[0]!, obstacles, clearance);
  return targetDrift > TARGET_DRIFT_METERS || (staleLeg && immediateThreat);
}

/** Combat keeps its committed flight waypoint while sharing field route geometry. */
function selectRouteWaypoint(
  ship: MutableCombatant,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  obstacles: readonly RouteObstacle[],
  clearance: number,
  deltaSeconds: number,
  immediateThreat: boolean
): CombatPoint | null {
  const fleeing = ship.tactic === 'flee';
  const forecast = brakingForecast(ship);
  const targetBlocked = pathBlocked(ship.position, target, obstacles, clearance, forecast.seconds);
  if (!fleeing && !immediateThreat && !targetBlocked) {
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
  const needRefresh = shouldRefreshCombatRoute(
    ship,
    target,
    route,
    obstacles,
    clearance,
    immediateThreat
  );
  if (!route.length || needRefresh) {
    const planned = plannedCombatRoute(
      ship.position,
      target,
      arena,
      obstacles,
      clearance,
      forecast.seconds
    );
    if (planned.length > 0) {
      ship.asteroidRoute = [...planned];
    } else {
      const flank = planFlankWaypoint(
        ship.position,
        target,
        obstacles,
        clearance,
        arena.width,
        arena.height
      );
      if (flank) ship.asteroidRoute = [flank, target];
      else if (route.length === 0) ship.asteroidRoute = [];
    }
    ship.nextAsteroidRouteAt = ROUTE_REFRESH_SECONDS;
  }
  return ship.asteroidRoute?.[0] ?? null;
}

/** The shared point planner supplies geometry; combat retains route commitment and flee policy. */
export function combatRouteHeading(
  ship: MutableCombatant,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  deltaSeconds: number
): CombatPoint | null {
  if (!arena.obstacles?.length) return null;
  const obstacles = routeObstacles(arena);
  const clearance = Math.max(25, ship.setup.shieldGeometry?.radiusY ?? 30) + 14;
  const originalLookahead = {
    x: ship.position.x + ship.velocity.x * 2,
    y: ship.position.y + ship.velocity.y * 2,
  };
  const immediateThreat = pathBlocked(ship.position, originalLookahead, obstacles, clearance + 35);
  const waypoint = selectRouteWaypoint(
    ship,
    target,
    arena,
    obstacles,
    clearance,
    deltaSeconds,
    immediateThreat
  );
  if (!waypoint) return null;
  const combatMayReplanForThreat =
    ship.tactic !== 'flee' &&
    immediateThreat &&
    pathBlocked(ship.position, waypoint, obstacles, clearance);
  const emergencyFlank = combatMayReplanForThreat
    ? planFlankWaypoint(ship.position, waypoint, obstacles, clearance, arena.width, arena.height)
    : null;
  // Keep PvP's immediate flank response. The common planner owns the flank
  // geometry; combat retains the original policy for using it under threat.
  const steeringPoint = emergencyFlank ?? waypoint;
  if (!steeringPoint) return null;
  const dx = steeringPoint.x - ship.position.x;
  const dy = steeringPoint.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  return distance > 0.001 ? { x: dx / distance, y: dy / distance } : null;
}
