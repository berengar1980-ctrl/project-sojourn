import type { PhysicalShipState } from './physical-ship-state';
import type { WorldPoint } from './world-types';

export interface ShipFlightBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Return the shared rectangular field limits, optionally inset from each edge. */
export function shipFlightBounds(width: number, height: number, inset = 0): ShipFlightBounds {
  return {
    left: inset,
    top: inset,
    right: Math.max(inset, width - inset),
    bottom: Math.max(inset, height - inset),
  };
}

export interface ShipFlightPerformance {
  readonly combatSpeed: number;
  readonly turnRateRadiansPerSecond: number;
  readonly accelerationMetersPerSecond2: number;
}

export interface ShipBoostCommand {
  readonly active: boolean;
  readonly speedMultiplier: number;
  readonly accelerationRampMultiplier: number;
  readonly rampSeconds: number;
  readonly rampDurationSeconds: number;
}

export interface ShipVelocityCommand {
  readonly direction: WorldPoint;
  readonly targetSpeed: number;
  readonly acceleration: number;
  readonly deltaSeconds: number;
  readonly accelerationMultiplier?: number;
  readonly rcsMultiplier?: number;
  readonly accelerationFraction?: number;
  readonly boost?: ShipBoostCommand;
  readonly targetSpeedCap?: number;
  readonly maxSpeed?: number;
  readonly bounds?: ShipFlightBounds;
}

/**
 * Turn the shared physical pose toward a heading and record the resulting
 * angular controls. Combat, route following, and work positioning use the
 * same turn clamp and signed turn-rate calculation.
 */
export function turnShipTowardHeading(
  ship: PhysicalShipState,
  targetHeadingRadians: number,
  maxTurnRateRadiansPerSecond: number,
  deltaSeconds: number
): number {
  if (deltaSeconds <= 0) {
    ship.turnRateRadiansPerSecond = 0;
    ship.angularThrust = 0;
    return angleDelta(ship.headingRadians, targetHeadingRadians);
  }

  const error = angleDelta(ship.headingRadians, targetHeadingRadians);
  const maximumTurn = Math.max(0, maxTurnRateRadiansPerSecond) * deltaSeconds;
  const turn = clamp(error, -maximumTurn, maximumTurn);
  ship.headingRadians = wrapAngle(ship.headingRadians + turn);
  ship.turnRateRadiansPerSecond = turn / deltaSeconds;
  ship.angularThrust =
    maxTurnRateRadiansPerSecond > 0 ? clamp(error / maxTurnRateRadiansPerSecond, -1, 1) : 0;
  return angleDelta(ship.headingRadians, targetHeadingRadians);
}

/** Apply the shared acceleration-limited velocity response and advance position. */
export function applyShipVelocityCommand(
  ship: PhysicalShipState,
  command: ShipVelocityCommand
): void {
  const dt = Math.max(0, command.deltaSeconds);
  if (dt === 0) return;

  const boost = command.boost?.active ? command.boost : undefined;
  const boostRamp = boost
    ? Math.min(1, Math.max(0, boost.rampSeconds) / Math.max(0.001, boost.rampDurationSeconds))
    : 0;
  const targetSpeed = Math.min(
    command.targetSpeed * (boost?.speedMultiplier ?? 1),
    command.targetSpeedCap ?? Infinity
  );
  const changeX = command.direction.x * targetSpeed - ship.velocity.x;
  const changeY = command.direction.y * targetSpeed - ship.velocity.y;
  const changeMagnitude = Math.hypot(changeX, changeY);
  const slowing = changeX * ship.velocity.x + changeY * ship.velocity.y < 0;
  const accelerationFraction = command.accelerationFraction ?? (slowing ? 1.35 : 1);
  const accelerationRamp = 1 + (boost?.accelerationRampMultiplier ?? 0) * boostRamp;
  const fraction = Math.min(
    1,
    (command.acceleration *
      (command.accelerationMultiplier ?? 1) *
      accelerationRamp *
      (command.rcsMultiplier ?? 1) *
      accelerationFraction *
      dt) /
      Math.max(0.001, changeMagnitude)
  );
  ship.velocity.x += changeX * fraction;
  ship.velocity.y += changeY * fraction;

  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  if (command.maxSpeed !== undefined && speed > command.maxSpeed) {
    ship.velocity.x *= command.maxSpeed / speed;
    ship.velocity.y *= command.maxSpeed / speed;
  }

  const nextX = ship.position.x + ship.velocity.x * dt;
  const nextY = ship.position.y + ship.velocity.y * dt;
  if (command.bounds) {
    ship.position.x = clamp(nextX, command.bounds.left, command.bounds.right);
    ship.position.y = clamp(nextY, command.bounds.top, command.bounds.bottom);
    if (nextX !== ship.position.x) ship.velocity.x = 0;
    if (nextY !== ship.position.y) ship.velocity.y = 0;
    return;
  }
  ship.position.x = nextX;
  ship.position.y = nextY;
}

/** Advance the existing inertial velocity when powered thrust is unavailable. */
export function advanceShipDrift(
  ship: PhysicalShipState,
  deltaSeconds: number,
  bounds?: ShipFlightBounds
): void {
  const dt = Math.max(0, deltaSeconds);
  const nextX = ship.position.x + ship.velocity.x * dt;
  const nextY = ship.position.y + ship.velocity.y * dt;
  if (!bounds) {
    ship.position.x = nextX;
    ship.position.y = nextY;
    return;
  }
  ship.position.x = clamp(nextX, bounds.left, bounds.right);
  ship.position.y = clamp(nextY, bounds.top, bounds.bottom);
}

export function wrapFlightAngle(angle: number): number {
  return wrapAngle(angle);
}

export function flightAngleDelta(current: number, target: number): number {
  return angleDelta(current, target);
}

function angleDelta(current: number, target: number): number {
  return wrapAngle(target - current);
}

function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
