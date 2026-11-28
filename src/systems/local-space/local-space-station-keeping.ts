import type { LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
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

function angleDelta(current: number, target: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
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
  deltaSeconds: number
): void {
  applyDisturbance(state, ship, seed, deltaSeconds);
  applyPositionKeeping(state, ship, hold, deltaSeconds);
  applyHeadingKeeping(state, ship, deltaSeconds);
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
  deltaSeconds: number
): void {
  const sideX = -Math.sin(ship.headingRadians);
  const sideY = Math.cos(ship.headingRadians);
  const offsetX = ship.position.x - hold.x;
  const offsetY = ship.position.y - hold.y;
  const lateralOffset = offsetX * sideX + offsetY * sideY;

  let lateralVelocity = localShipLateralSpeed(ship);
  let thrust = -lateralOffset * 0.11 - lateralVelocity * 0.62;
  thrust = Math.max(-0.27, Math.min(0.27, thrust));
  if (Math.abs(thrust) < 0.045) thrust = 0;

  ship.lateralThrust = thrust;
  lateralVelocity += thrust * 1.8 * deltaSeconds;
  lateralVelocity = Math.max(-0.8, Math.min(0.8, lateralVelocity));
  setLocalShipComponents(ship, 0, lateralVelocity);
  ship.position = {
    x: ship.position.x + sideX * lateralVelocity * deltaSeconds,
    y: ship.position.y + sideY * lateralVelocity * deltaSeconds,
  };
}

function applyHeadingKeeping(
  state: IdleStationKeepingState,
  ship: LocalShipState,
  deltaSeconds: number
): void {
  const headingError = angleDelta(ship.headingRadians, state.targetHeading);
  let angularThrust = headingError * 0.82 - state.angularVelocity * 1.22;
  angularThrust = Math.max(-0.34, Math.min(0.34, angularThrust));

  if (Math.abs(headingError) < 0.004 && Math.abs(state.angularVelocity) < 0.003) {
    angularThrust = 0;
  }

  state.angularVelocity += angularThrust * 0.32 * deltaSeconds;
  state.angularVelocity = Math.max(-0.048, Math.min(0.048, state.angularVelocity));
  ship.headingRadians += state.angularVelocity * deltaSeconds;
  ship.turnRateRadiansPerSecond = state.angularVelocity;
  ship.angularThrust = angularThrust / 0.34;
}
