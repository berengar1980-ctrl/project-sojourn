import type { LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import {
  applyShipVelocityCommand,
  turnShipTowardHeading,
  type ShipFlightPerformance,
  type ShipFlightBounds,
} from '../../core/ship-flight-physics';
import {
  localShipForwardSpeed,
  localShipLateralSpeed,
  setLocalShipComponents,
} from './local-space-ship-velocity';

export interface IdleStationKeepingState {
  targetHeading: number;
  angularVelocity: number;
  disturbanceTimer: number;
  disturbanceIndex: number;
}

export function createIdleStationKeepingState(
  seed: number,
  ship: LocalShipState
): IdleStationKeepingState {
  const lateralVelocity = ((seed % 2001) / 2000 - 0.5) * 0.68;
  setLocalShipComponents(ship, localShipForwardSpeed(ship), lateralVelocity);
  return {
    targetHeading: ship.headingRadians,
    angularVelocity: ((seed % 997) / 996 - 0.5) * 0.025,
    disturbanceTimer: 1.8 + (seed % 2400) / 1000,
    disturbanceIndex: 0,
  };
}

export function resetIdleStationKeeping(
  state: IdleStationKeepingState,
  ship: LocalShipState
): void {
  state.targetHeading = ship.headingRadians;
  setLocalShipComponents(ship, localShipForwardSpeed(ship), localShipLateralSpeed(ship) * 0.35);
  state.angularVelocity *= 0.35;
  state.disturbanceTimer = Math.max(1.2, state.disturbanceTimer);
}

export function updateIdleStationKeeping(
  state: IdleStationKeepingState,
  ship: LocalShipState,
  hold: WorldPoint,
  seed: number,
  deltaSeconds: number,
  performance?: ShipFlightPerformance,
  bounds?: ShipFlightBounds
): void {
  applyDisturbance(state, ship, seed, deltaSeconds);
  applyPositionKeeping(state, ship, hold, deltaSeconds, performance, bounds);
  applyHeadingKeeping(state, ship, deltaSeconds, performance);
}

function applyDisturbance(
  state: IdleStationKeepingState,
  ship: LocalShipState,
  seed: number,
  deltaSeconds: number
): void {
  state.disturbanceTimer -= deltaSeconds;
  if (state.disturbanceTimer > 0) return;

  const phase = seed * 0.00017 + state.disturbanceIndex * 1.618;
  const lateralVelocity = localShipLateralSpeed(ship);
  setLocalShipComponents(
    ship,
    localShipForwardSpeed(ship),
    lateralVelocity + Math.sin(phase * 7.31) * 0.23
  );
  state.angularVelocity += Math.sin(phase * 11.73 + 0.8) * 0.024;
  state.disturbanceIndex += 1;
  state.disturbanceTimer = 2.2 + Math.abs(Math.sin(phase * 3.17)) * 3.2;
}

function applyPositionKeeping(
  state: IdleStationKeepingState,
  ship: LocalShipState,
  hold: WorldPoint,
  deltaSeconds: number,
  performance?: ShipFlightPerformance,
  bounds?: ShipFlightBounds
): void {
  const offsetX = ship.position.x - hold.x;
  const offsetY = ship.position.y - hold.y;
  const distance = Math.hypot(offsetX, offsetY);
  const direction =
    distance > 0 ? { x: -offsetX / distance, y: -offsetY / distance } : { x: 0, y: 0 };
  const acceleration = performance?.accelerationMetersPerSecond2 ?? 1.2;
  const targetSpeed = Math.min(0.8, Math.sqrt(2 * acceleration * distance));
  applyShipVelocityCommand(ship, {
    direction,
    targetSpeed,
    acceleration,
    accelerationMultiplier: 0.4,
    deltaSeconds,
    maxSpeed: 0.8,
    ...(bounds ? { bounds } : {}),
  });
  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  ship.longitudinalThrust = direction.x * forwardX + direction.y * forwardY;
  ship.lateralThrust = direction.x * -forwardY + direction.y * forwardX;
}

function applyHeadingKeeping(
  state: IdleStationKeepingState,
  ship: LocalShipState,
  deltaSeconds: number,
  performance?: ShipFlightPerformance
): void {
  state.angularVelocity *= Math.exp(-1.22 * deltaSeconds);
  turnShipTowardHeading(
    ship,
    state.targetHeading + state.angularVelocity,
    performance?.turnRateRadiansPerSecond ?? 0.4,
    deltaSeconds
  );
}
