import type { LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { FieldRouteObstacle } from '../navigation/field-ship-routing';
import { trafficStepClear } from '../navigation/field-traffic-obstacles';
import {
  beginTrafficLeg,
  endTrafficLeg,
  noteTrafficProgress,
  needsTrafficEscape,
  trafficEscapeWaypoint,
} from '../navigation/field-traffic-priority';
import { angleDelta, distance, heading, moveToward, turnToward } from './local-space-motion';

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
  ship.speed = 0;
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
  return Math.abs(angleDelta(ship.headingRadians, targetHeading)) >= REVERSE_HEADING_THRESHOLD;
}

function advanceReverseCorrection(
  ship: LocalShipState,
  waypoint: WorldPoint,
  cruiseSpeed: number,
  deltaSeconds: number,
  remainingDistance: number
): void {
  const reverseSpeed = Math.min(
    MAX_REVERSE_SPEED,
    cruiseSpeed * 0.24,
    Math.max(5, remainingDistance * 0.72)
  );
  ship.position = moveToward(ship.position, waypoint, reverseSpeed * deltaSeconds);
  ship.speed = -reverseSpeed;
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
  traffic?: AutopilotTraffic
): RouteAdvanceResult {
  if (index >= route.length) return { nextIndex: index, completed: true };

  const start = ship.position;
  const escape = autopilotEscape(ship, route[route.length - 1]!, traffic);
  if (escape === null) {
    ship.speed = 0;
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
    advanceReverseCorrection(ship, waypoint, cruiseSpeed, deltaSeconds, remainingDistance);
  } else {
    advanceForwardRoute(
      ship,
      waypoint,
      cruiseSpeed,
      deltaSeconds,
      remainingDistance,
      finalWaypoint,
      brakeAtFinalWaypoint,
      turnRateMultiplier
    );
  }

  const arrivalDistance = finalWaypoint && brakeAtFinalWaypoint ? 2 : 1;
  const arrived = distance(ship.position, waypoint) <= arrivalDistance;
  const next = arrived ? waypoint : ship.position;
  if (
    traffic &&
    !trafficStepClear(start, next, deltaSeconds, traffic.obstacles, traffic.clearance, ship)
  ) {
    ship.position = start;
    ship.speed = 0;
    noteTrafficProgress(ship, deltaSeconds, true);
    return { nextIndex: index, completed: false };
  }
  if (traffic) noteTrafficProgress(ship, deltaSeconds, false);
  if (!arrived) return { nextIndex: index, completed: false };

  ship.position = { ...waypoint };
  ship.speed = 0;
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
  turnRateMultiplier: number
): void {
  const desiredHeading = heading(ship.position, waypoint);
  const previousHeading = ship.headingRadians;
  ship.headingRadians = turnToward(
    ship.headingRadians,
    desiredHeading,
    MAX_TURN_RATE * turnRateMultiplier * deltaSeconds
  );
  ship.turnRateRadiansPerSecond = angleDelta(previousHeading, ship.headingRadians) / deltaSeconds;
  ship.angularThrust = Math.max(
    -1,
    Math.min(1, angleDelta(previousHeading, desiredHeading) / (Math.PI / 5))
  );
  ship.lateralThrust = 0;

  const remainingTurn = Math.abs(angleDelta(ship.headingRadians, desiredHeading));
  const alignment = Math.max(brakeAtFinalWaypoint ? 0.16 : 0.18, 1 - remainingTurn / (Math.PI / 2));
  const desiredSpeed =
    brakeAtFinalWaypoint && finalWaypoint
      ? Math.min(cruiseSpeed, Math.max(12, remainingDistance * 0.72))
      : cruiseSpeed;
  const travelSpeed = desiredSpeed * alignment;
  ship.position = moveToward(ship.position, waypoint, travelSpeed * deltaSeconds);
  ship.speed = travelSpeed;
}

export function faceAutopilotTarget(
  ship: LocalShipState,
  target: WorldPoint,
  deltaSeconds: number,
  turnRateMultiplier = 1
): boolean {
  const desiredHeading = heading(ship.position, target);
  const previousHeading = ship.headingRadians;
  ship.headingRadians = turnToward(
    ship.headingRadians,
    desiredHeading,
    MAX_TURN_RATE * turnRateMultiplier * deltaSeconds
  );
  ship.turnRateRadiansPerSecond = angleDelta(previousHeading, ship.headingRadians) / deltaSeconds;
  ship.angularThrust = Math.max(
    -1,
    Math.min(1, angleDelta(previousHeading, desiredHeading) / (Math.PI / 6))
  );
  ship.lateralThrust = 0;
  ship.speed = 0;

  if (Math.abs(angleDelta(ship.headingRadians, desiredHeading)) > 0.04) return false;
  ship.headingRadians = desiredHeading;
  ship.turnRateRadiansPerSecond = 0;
  ship.angularThrust = 0;
  return true;
}
