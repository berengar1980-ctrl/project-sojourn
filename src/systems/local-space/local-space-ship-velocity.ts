import type { LocalShipState, MiningPhase } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

export interface LocalShipVelocityState {
  readonly miningPhase: MiningPhase;
  readonly shipForwardVelocity: number;
  readonly shipLateralVelocity: number;
  readonly idleLateralVelocity: number;
}

export function localShipVelocity(
  ship: LocalShipState,
  state: LocalShipVelocityState
): WorldPoint {
  const forward = {
    x: Math.cos(ship.headingRadians),
    y: Math.sin(ship.headingRadians),
  };
  const side = { x: -forward.y, y: forward.x };
  const forwardSpeed = state.miningPhase === 'extracting' ? state.shipForwardVelocity : ship.speed;
  const lateralSpeed =
    state.miningPhase === 'idle' ? state.idleLateralVelocity : state.shipLateralVelocity;

  return {
    x: forward.x * forwardSpeed + side.x * lateralSpeed,
    y: forward.y * forwardSpeed + side.y * lateralSpeed,
  };
}
