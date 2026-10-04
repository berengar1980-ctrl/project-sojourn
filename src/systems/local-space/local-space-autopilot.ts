import type { LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { angleDelta, distance, heading, moveToward, turnToward } from './local-space-motion';

const MAX_TURN_RATE = 1.15;

export interface RouteAdvanceResult {
  readonly nextIndex: number;
  readonly completed: boolean;
}

export function resetAutopilotMotion(ship: LocalShipState): void {
  ship.speed = 0;
  ship.turnRateRadiansPerSecond = 0;
  ship.angularThrust = 0;
  ship.lateralThrust = 0;
}

export function advanceAutopilotRoute(
  ship: LocalShipState,
  route: readonly WorldPoint[],
  index: number,
  cruiseSpeed: number,
  deltaSeconds: number,
  brakeAtFinalWaypoint: boolean,
  allowShortReverse = false
): RouteAdvanceResult {
  if (index >= route.length) return { nextIndex: index, completed: true };

  const waypoint = route[index]!;
  const desiredHeading = heading(ship.position, waypoint);
  const previousHeading = ship.headingRadians;
  ship.headingRadians = turnToward(
    ship.headingRadians,
    desiredHeading,
    MAX_TURN_RATE * deltaSeconds
  );
  ship.turnRateRadiansPerSecond = angleDelta(previousHeading, ship.headingRadians) / deltaSeconds;
  ship.angularThrust = Math.max(
    -1,
    Math.min(1, angleDelta(previousHeading, desiredHeading) / (Math.PI / 5))
  );
  ship.lateralThrust = 0;

  const remainingTurn = Math.abs(angleDelta(ship.headingRadians, desiredHeading));
  const remainingDistance = distance(ship.position, waypoint);
  const finalWaypoint = index === route.length - 1;
  const reverseCorrection =
    allowShortReverse &&
    finalWaypoint &&
    remainingDistance <= 190 &&
    remainingTurn >= Math.PI * 0.72;

  if (reverseCorrection) {
    const reverseSpeed = Math.min(26, Math.max(6, remainingDistance * 0.38));
    ship.turnRateRadiansPerSecond = 0;
    ship.angularThrust = 0;
    ship.lateralThrust = 0;
    ship.position = moveToward(ship.position, waypoint, reverseSpeed * deltaSeconds);
    ship.speed = -reverseSpeed;

    if (distance(ship.position, waypoint) > 1) {
      return { nextIndex: index, completed: false };
    }

    ship.position = { ...waypoint };
    const nextIndex = index + 1;
    return { nextIndex, completed: nextIndex >= route.length };
  }

  const alignment = Math.max(brakeAtFinalWaypoint ? 0.16 : 0.18, 1 - remainingTurn / (Math.PI / 2));
  const desiredSpeed =
    brakeAtFinalWaypoint && finalWaypoint
      ? Math.min(cruiseSpeed, Math.max(12, remainingDistance * 0.72))
      : cruiseSpeed;
  const travelSpeed = desiredSpeed * alignment;
  ship.position = moveToward(ship.position, waypoint, travelSpeed * deltaSeconds);
  ship.speed = travelSpeed;

  const arrivalDistance = finalWaypoint && brakeAtFinalWaypoint ? 2 : 1;
  if (distance(ship.position, waypoint) > arrivalDistance) {
    return { nextIndex: index, completed: false };
  }

  ship.position = { ...waypoint };
  const nextIndex = index + 1;
  return { nextIndex, completed: nextIndex >= route.length };
}

export function faceAutopilotTarget(
  ship: LocalShipState,
  target: WorldPoint,
  deltaSeconds: number
): boolean {
  const desiredHeading = heading(ship.position, target);
  const previousHeading = ship.headingRadians;
  ship.headingRadians = turnToward(
    ship.headingRadians,
    desiredHeading,
    MAX_TURN_RATE * deltaSeconds
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
