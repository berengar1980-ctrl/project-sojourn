import type { LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import {
  applyShipVelocityCommand,
  flightAngleDelta,
  turnShipTowardHeading,
  type ShipFlightBounds,
  type ShipFlightPerformance,
} from '../../core/ship-flight-physics';
import { ensurePhysicalShipVelocity } from '../../core/physical-ship-state';
import type { FieldRouteObstacle } from '../navigation/field-ship-routing';
import { trafficStepClear } from '../navigation/field-traffic-obstacles';
import {
  beginTrafficLeg,
  endTrafficLeg,
  noteTrafficProgress,
  needsTrafficEscape,
  trafficEscapeWaypoint,
} from '../navigation/field-traffic-priority';
import { distance, heading } from './local-space-motion';
import { clearLocalShipVelocity } from './local-space-ship-velocity';

const MAX_TURN_RATE = 1.15;
const REVERSE_CORRECTION_DISTANCE = 120;
const REVERSE_HEADING_THRESHOLD = Math.PI * 0.58;
const MAX_REVERSE_SPEED = 18;

export interface RouteAdvanceResult {
  readonly nextIndex: number;
  readonly completed: boolean;
}

export function resetAutopilotMotion(ship: LocalShipState): void {
  endTrafficLeg(ship);
  clearLocalShipVelocity(ship);
  ship.turnRateRadiansPerSecond = 0;
  ship.angularThrust = 0;
  ship.lateralThrust = 0;
}

function canReverseToFinalWaypoint(
  ship: LocalShipState,
  waypoint: WorldPoint,
  remainingDistance: number,
  finalWaypoint: boolean,
  allowReverseCorrection: boolean
): boolean {
  if (
    !allowReverseCorrection ||
    !finalWaypoint ||
    remainingDistance > REVERSE_CORRECTION_DISTANCE
  ) {
    return false;
  }

  const targetHeading = heading(ship.position, waypoint);
  return (
    Math.abs(flightAngleDelta(ship.headingRadians, targetHeading)) >= REVERSE_HEADING_THRESHOLD
  );
}

function advanceReverseCorrection(
  ship: LocalShipState,
  waypoint: WorldPoint,
  cruiseSpeed: number,
  deltaSeconds: number,
  remainingDistance: number,
  performance?: ShipFlightPerformance,
  bounds?: ShipFlightBounds
): void {
  ensurePhysicalShipVelocity(ship);
  const reverseSpeed = Math.min(
    MAX_REVERSE_SPEED,
    cruiseSpeed * 0.24,
    Math.max(5, remainingDistance * 0.72)
  );
  const direction = heading(ship.position, waypoint);
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const range = Math.max(0.001, Math.hypot(dx, dy));
  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  ship.longitudinalThrust = -Math.min(1, reverseSpeed / Math.max(1, cruiseSpeed));
  ship.lateralThrust = Math.max(-1, Math.min(1, (forwardX * dy - forwardY * dx) / range));
  applyShipVelocityCommand(ship, {
    direction: { x: Math.cos(direction), y: Math.sin(direction) },
    targetSpeed: reverseSpeed,
    acceleration: performance?.accelerationMetersPerSecond2 ?? 30,
    deltaSeconds,
    ...(performance ? { maxSpeed: performance.combatSpeed } : {}),
    ...(bounds ? { bounds } : {}),
  });
  ship.turnRateRadiansPerSecond = 0;
  ship.angularThrust = 0;
  ship.lateralThrust = 0;
}

interface AutopilotTraffic {
  readonly obstacles: readonly FieldRouteObstacle[];
  readonly clearance: number;
  readonly solids?: () => readonly FieldRouteObstacle[];
}

function autopilotEscape(
  ship: LocalShipState,
  target: WorldPoint,
  traffic?: AutopilotTraffic
): WorldPoint | null | undefined {
  if (!traffic) return undefined;
  beginTrafficLeg(ship, target, 'player');
  if (!traffic.solids || !needsTrafficEscape(ship)) return undefined;
  return trafficEscapeWaypoint(
    ship,
    [...traffic.solids(), ...traffic.obstacles],
    traffic.clearance
  );
}

export function advanceAutopilotRoute(
  ship: LocalShipState,
  route: readonly WorldPoint[],
  index: number,
  cruiseSpeed: number,
  deltaSeconds: number,
  brakeAtFinalWaypoint: boolean,
  allowReverseCorrection = false,
  turnRateMultiplier = 1,
  traffic?: AutopilotTraffic,
  performance?: ShipFlightPerformance,
  bounds?: ShipFlightBounds
): RouteAdvanceResult {
  if (index >= route.length) return { nextIndex: index, completed: true };
  ensurePhysicalShipVelocity(ship);

  const start = { ...ship.position };
  const escape = autopilotEscape(ship, route[route.length - 1]!, traffic);
  if (escape === null) {
    clearLocalShipVelocity(ship);
    noteTrafficProgress(ship, deltaSeconds, true);
    return { nextIndex: index, completed: false };
  }
  const waypoint = escape ?? route[index]!;
  const remainingDistance = distance(ship.position, waypoint);
  const finalWaypoint = !escape && index === route.length - 1;

  if (
    canReverseToFinalWaypoint(
      ship,
      waypoint,
      remainingDistance,
      finalWaypoint,
      allowReverseCorrection
    )
  ) {
    advanceReverseCorrection(
      ship,
      waypoint,
      cruiseSpeed,
      deltaSeconds,
      remainingDistance,
      performance,
      bounds
    );
  } else {
    advanceForwardRoute(
      ship,
      waypoint,
      cruiseSpeed,
      deltaSeconds,
      remainingDistance,
      finalWaypoint,
      brakeAtFinalWaypoint,
      turnRateMultiplier,
      performance,
      bounds
    );
  }

  const arrivalDistance = finalWaypoint && brakeAtFinalWaypoint ? 2 : 1;
  const arrived =
    distance(ship.position, waypoint) <= arrivalDistance &&
    Math.hypot(ship.velocity.x, ship.velocity.y) <= 2;
  const next = arrived ? waypoint : ship.position;
  const desiredHeading = heading(start, waypoint);
  const intendedNext = {
    x: start.x + Math.cos(desiredHeading) * cruiseSpeed * deltaSeconds,
    y: start.y + Math.sin(desiredHeading) * cruiseSpeed * deltaSeconds,
  };
  if (
    traffic &&
    (!trafficStepClear(start, next, deltaSeconds, traffic.obstacles, traffic.clearance, ship) ||
      !trafficStepClear(
        start,
        intendedNext,
        deltaSeconds,
        traffic.obstacles,
        traffic.clearance,
        ship
      ))
  ) {
    ship.position = start;
    clearLocalShipVelocity(ship);
    noteTrafficProgress(ship, deltaSeconds, true);
    return { nextIndex: index, completed: false };
  }
  if (traffic) noteTrafficProgress(ship, deltaSeconds, false);
  if (!arrived) return { nextIndex: index, completed: false };

  ship.position = { ...waypoint };
  clearLocalShipVelocity(ship);
  if (escape) return { nextIndex: index, completed: false };
  const nextIndex = index + 1;
  if (nextIndex >= route.length) endTrafficLeg(ship);
  return { nextIndex, completed: nextIndex >= route.length };
}

function advanceForwardRoute(
  ship: LocalShipState,
  waypoint: WorldPoint,
  cruiseSpeed: number,
  deltaSeconds: number,
  remainingDistance: number,
  finalWaypoint: boolean,
  brakeAtFinalWaypoint: boolean,
  turnRateMultiplier: number,
  performance?: ShipFlightPerformance,
  bounds?: ShipFlightBounds
): void {
  const desiredHeading = heading(ship.position, waypoint);
  const initialHeadingError = flightAngleDelta(ship.headingRadians, desiredHeading);
  const turnRate = performance?.turnRateRadiansPerSecond ?? MAX_TURN_RATE * turnRateMultiplier;
  const remainingTurn = Math.abs(
    turnShipTowardHeading(ship, desiredHeading, turnRate, deltaSeconds)
  );
  ship.lateralThrust = 0;

  const alignment = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(initialHeadingError))));
  const desiredSpeed =
    brakeAtFinalWaypoint && finalWaypoint
      ? Math.min(
          cruiseSpeed,
          Math.sqrt(
            2 *
              (performance?.accelerationMetersPerSecond2 ?? 30) *
              (remainingTurn > 0.35 ? 0.4 : 1) *
              Math.max(0, remainingDistance)
          )
        )
      : cruiseSpeed;
  const travelSpeed = desiredSpeed * alignment;
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const magnitude = Math.hypot(dx, dy);
  const rcsTranslation =
    brakeAtFinalWaypoint && finalWaypoint && Math.abs(initialHeadingError) > 0.35;
  const direction = rcsTranslation
    ? magnitude > 0
      ? { x: dx / magnitude, y: dy / magnitude }
      : { x: 0, y: 0 }
    : { x: Math.cos(ship.headingRadians), y: Math.sin(ship.headingRadians) };
  const headingError = flightAngleDelta(ship.headingRadians, desiredHeading);
  ship.lateralThrust = rcsTranslation ? Math.max(-1, Math.min(1, Math.sin(headingError))) : 0;
  ship.longitudinalThrust = Math.max(
    -1,
    Math.min(1, (travelSpeed / Math.max(1, cruiseSpeed)) * Math.cos(headingError))
  );
  applyShipVelocityCommand(ship, {
    direction,
    targetSpeed: travelSpeed,
    acceleration: performance?.accelerationMetersPerSecond2 ?? 30,
    deltaSeconds,
    ...(rcsTranslation ? { accelerationMultiplier: 0.4 } : {}),
    ...(performance ? { maxSpeed: performance.combatSpeed } : {}),
    ...(bounds ? { bounds } : {}),
  });
}

export function faceAutopilotTarget(
  ship: LocalShipState,
  target: WorldPoint,
  deltaSeconds: number,
  turnRateMultiplier = 1,
  performance?: ShipFlightPerformance,
  bounds?: ShipFlightBounds
): boolean {
  const desiredHeading = heading(ship.position, target);
  const turnRate = performance?.turnRateRadiansPerSecond ?? MAX_TURN_RATE * turnRateMultiplier;
  turnShipTowardHeading(ship, desiredHeading, turnRate, deltaSeconds);
  ship.lateralThrust = 0;
  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  applyShipVelocityCommand(ship, {
    direction: { x: 0, y: 0 },
    targetSpeed: 0,
    acceleration: performance?.accelerationMetersPerSecond2 ?? 30,
    deltaSeconds,
    maxSpeed: speed,
    ...(bounds ? { bounds } : {}),
  });

  if (Math.abs(flightAngleDelta(ship.headingRadians, desiredHeading)) > 0.04) return false;
  ship.headingRadians = desiredHeading;
  ship.turnRateRadiansPerSecond = 0;
  ship.angularThrust = 0;
  return true;
}
