import type { WorldPoint } from '../../core/world-types';
import type { PhysicalShipState } from '../../core/physical-ship-state';
import { ensurePhysicalShipVelocity } from '../../core/physical-ship-state';
import {
  applyShipVelocityCommand,
  flightAngleDelta,
  turnShipTowardHeading,
  type ShipFlightBounds,
  type ShipFlightPerformance,
} from '../../core/ship-flight-physics';
import { measurePerformance } from '../../core/performance-diagnostics';
import { clampedSegmentProjection, distance } from '../../core/field-geometry';
import { planPointRoute } from '../local-space/local-space-navigation';
import { planFieldPatrolRoute } from './field-patrol-route';
import {
  trafficDestinationOccupied,
  trafficPlanningObstacles,
  trafficStepClear,
} from './field-traffic-obstacles';
import {
  beginTrafficLeg,
  endTrafficLeg,
  noteTrafficProgress,
  trafficEscapeWaypoint,
} from './field-traffic-priority';

import type { FieldRouteObstacle } from '../../core/field-traffic-types';
export type { FieldRouteObstacle } from '../../core/field-traffic-types';

/** The active route is part of the ship's checkpoint, not hidden in a WeakMap. */
export interface FieldRouteState {
  readonly target: WorldPoint;
  readonly points: readonly WorldPoint[];
  index: number;
}

export interface FieldRouteShip extends PhysicalShipState {
  readonly speed: number;
  routeState?: FieldRouteState;
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
  const t = clampedSegmentProjection(obstacle.position, start, dx, dy, lengthSq);
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
  });
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
  const planning = trafficPlanningObstacles(target, obstacles, clearance);
  const saved = ship.routeState;
  // A ship or drifting obstacle may have entered an already planned route.
  // Invalidate the checkpointed path before attempting to move through it.
  if (saved) {
    const nextWaypoint = saved.points[saved.index] ?? target;
    // A close route corner must be completed before recomputing it. Otherwise
    // drifting asteroid clearance halos force a new 5-10 m detour each tick
    // and a miner can circle forever without reaching its work target.
    const establishedCorner =
      distance(ship.position, nextWaypoint) <= Math.max(32, Math.min(80, ship.speed * 2.5));
    if (
      !establishedCorner &&
      planning.some((obstacle) => blocked(ship.position, nextWaypoint, obstacle, clearance))
    )
      delete ship.routeState;
  }
  const current = ship.routeState;
  if (!current || distance(current.target, target) > 1 || current.index >= current.points.length) {
    // An occupied destination cannot be solved by repeated full-field searches.
    if (trafficDestinationOccupied(target, planning, clearance)) return null;
    const points = measurePerformance('sim.field.route-search', () =>
      makeRoute(ship.position, target, planning, clearance, mode)
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
  mode: 'grid' | 'patrol' = 'grid',
  performance?: ShipFlightPerformance,
  bounds?: ShipFlightBounds
): boolean {
  ensurePhysicalShipVelocity(ship);
  beginTrafficLeg(ship, target);
  const escape = trafficEscapeWaypoint(ship, obstacles, clearance);
  const waypoint =
    escape === undefined ? fieldRouteTarget(ship, target, obstacles, clearance, mode) : escape;
  if (!waypoint) {
    ship.velocity = { x: 0, y: 0 };
    noteTrafficProgress(ship, dt, true);
    return false;
  }
  const route = ship.routeState;
  const finalWaypoint = Boolean(!escape && route && route.index === route.points.length - 1);
  const start = { ...ship.position };
  const command = fieldFlightCommand(
    ship,
    waypoint,
    speed,
    dt,
    finalWaypoint,
    Boolean(escape),
    performance
  );
  applyShipVelocityCommand(ship, {
    direction: command.direction,
    targetSpeed: command.targetSpeed,
    acceleration: command.acceleration,
    deltaSeconds: dt,
    ...(escape || (finalWaypoint && Math.abs(command.headingError) > 0.35)
      ? { accelerationMultiplier: 0.4 }
      : {}),
    maxSpeed: performance?.combatSpeed ?? Math.max(0, speed),
    ...(bounds ? { bounds } : {}),
  });
  if (!fieldTrafficStepClear(start, ship.position, command, dt, obstacles, clearance, ship)) {
    ship.position = start;
    ship.velocity = { x: 0, y: 0 };
    noteTrafficProgress(ship, dt, true);
    return false;
  }
  const waypointDistance = distance(ship.position, waypoint);
  const arrives = finalWaypoint
    ? waypointDistance <= 4 && Math.hypot(ship.velocity.x, ship.velocity.y) <= 5
    : waypointDistance <= Math.max(32, Math.min(80, Math.max(0, speed) * 2.5));
  if (arrives) return finishFieldWaypoint(ship, waypoint, target, finalWaypoint, escape, dt);
  noteTrafficProgress(ship, dt, false);
  return false;
}

interface FieldFlightCommand {
  readonly direction: WorldPoint;
  readonly targetSpeed: number;
  readonly acceleration: number;
  readonly headingError: number;
}

function fieldFlightCommand(
  ship: FieldRouteShip,
  waypoint: WorldPoint,
  speed: number,
  dt: number,
  finalWaypoint: boolean,
  escape: boolean,
  performance?: ShipFlightPerformance
): FieldFlightCommand {
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const remaining = Math.hypot(dx, dy);
  const desiredHeading = Math.atan2(dy, dx);
  const headingError = flightAngleDelta(ship.headingRadians, desiredHeading);
  const turnRate = performance?.turnRateRadiansPerSecond ?? 1.15;
  turnShipTowardHeading(ship, desiredHeading, turnRate, Math.max(0, dt));
  const alignment = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(headingError))));
  const acceleration = performance?.accelerationMetersPerSecond2 ?? 30;
  const toward = remaining > 0 ? { x: dx / remaining, y: dy / remaining } : { x: 0, y: 0 };
  const closingSpeed = Math.max(0, ship.velocity.x * toward.x + ship.velocity.y * toward.y);
  const braking =
    finalWaypoint &&
    closingSpeed > 0.2 &&
    remaining <= (closingSpeed * closingSpeed) / (2 * acceleration * 0.4) + 2;
  const targetSpeed = finalWaypoint
    ? braking
      ? 0
      : Math.min(Math.max(0, speed), Math.sqrt(2 * acceleration * 0.4 * remaining))
    : Math.max(0, speed) * alignment;
  return {
    direction: braking
      ? { x: 0, y: 0 }
      : finalWaypoint || escape
        ? toward
        : { x: Math.cos(ship.headingRadians), y: Math.sin(ship.headingRadians) },
    targetSpeed,
    acceleration,
    headingError,
  };
}

function fieldTrafficStepClear(
  start: WorldPoint,
  next: WorldPoint,
  command: FieldFlightCommand,
  dt: number,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number,
  ship: FieldRouteShip
): boolean {
  const intendedNext = {
    x: start.x + command.direction.x * command.targetSpeed * dt,
    y: start.y + command.direction.y * command.targetSpeed * dt,
  };
  return (
    trafficStepClear(start, next, dt, obstacles, clearance, ship) &&
    trafficStepClear(start, intendedNext, dt, obstacles, clearance, ship)
  );
}

function finishFieldWaypoint(
  ship: FieldRouteShip,
  waypoint: WorldPoint,
  target: WorldPoint,
  finalWaypoint: boolean,
  escape: WorldPoint | null | undefined,
  dt: number
): boolean {
  if (escape) {
    delete ship.routeState;
    noteTrafficProgress(ship, dt, false);
    return false;
  }
  if (finalWaypoint) {
    ship.position = { ...waypoint };
    ship.velocity = { x: 0, y: 0 };
  }
  const route = ship.routeState!;
  route.index += 1;
  if (route.index < route.points.length) return false;
  delete ship.routeState;
  endTrafficLeg(ship);
  return distance(ship.position, target) < 2 && Math.hypot(ship.velocity.x, ship.velocity.y) <= 2;
}
