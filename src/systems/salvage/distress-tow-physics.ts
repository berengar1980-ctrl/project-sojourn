import type { WorldPoint } from '../../core/world-types';

export interface DistressTowState {
  readonly position: WorldPoint;
  readonly velocity: WorldPoint;
  readonly headingRadians: number;
  readonly elapsedSeconds: number;
  readonly attached: boolean;
  readonly cableLength: number;
  readonly cableTension: number;
}

export function createDistressTowState(position: WorldPoint, headingRadians = 0): DistressTowState {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0 },
    headingRadians,
    elapsedSeconds: 0,
    attached: false,
    cableLength: 220,
    cableTension: 0,
  };
}

function advanceTowStep(
  state: DistressTowState,
  ship: WorldPoint,
  heading: number,
  dt: number
): DistressTowState {
  const elapsedSeconds = state.elapsedSeconds + dt;
  const attached = elapsedSeconds >= 0.65;
  if (!attached) return { ...state, elapsedSeconds };
  const stern = {
    x: ship.x - Math.cos(heading) * 70,
    y: ship.y - Math.sin(heading) * 70,
  };
  const dx = stern.x - state.position.x;
  const dy = stern.y - state.position.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const nx = dx / length;
  const ny = dy / length;
  const extension = Math.max(0, length - state.cableLength);
  const radialVelocity = state.velocity.x * nx + state.velocity.y * ny;
  const tensionForce = Math.max(0, Math.min(620, extension * 3.4 - radialVelocity * 1.6));
  const drag = Math.exp(-0.22 * dt);
  const velocity = {
    x: (state.velocity.x + nx * tensionForce * dt) * drag,
    y: (state.velocity.y + ny * tensionForce * dt) * drag,
  };
  const position = {
    x: state.position.x + velocity.x * dt,
    y: state.position.y + velocity.y * dt,
  };
  const speed = Math.hypot(velocity.x, velocity.y);
  const targetHeading = speed > 8 ? Math.atan2(velocity.y, velocity.x) : state.headingRadians;
  const delta = Math.atan2(
    Math.sin(targetHeading - state.headingRadians),
    Math.cos(targetHeading - state.headingRadians)
  );
  return {
    ...state,
    position,
    velocity,
    headingRadians: state.headingRadians + delta * Math.min(1, 2.5 * dt),
    elapsedSeconds,
    attached,
    cableTension: Math.min(1, extension / 180),
  };
}

export function advanceDistressTow(
  state: DistressTowState,
  ship: WorldPoint,
  shipHeading: number,
  deltaSeconds: number
): DistressTowState {
  let remaining = Math.max(0, Math.min(0.25, deltaSeconds));
  let current = state;
  while (remaining > 0.000001) {
    const step = Math.min(0.025, remaining);
    current = advanceTowStep(current, ship, shipHeading, step);
    remaining -= step;
  }
  return current;
}

export function towShipAtExit(
  ship: WorldPoint,
  tow: DistressTowState,
  exit: WorldPoint,
  range = 150
): boolean {
  return tow.attached &&
    Math.hypot(ship.x - exit.x, ship.y - exit.y) <= range &&
    Math.hypot(tow.position.x - exit.x, tow.position.y - exit.y) <= range + 380;
}
