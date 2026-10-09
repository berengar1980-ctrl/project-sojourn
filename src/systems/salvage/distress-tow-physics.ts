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

export function createDistressTowState(position: WorldPoint): DistressTowState {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0 },
    headingRadians: 0,
    elapsedSeconds: 0,
    attached: false,
    cableLength: 220,
    cableTension: 0,
  };
}

export function advanceDistressTow(
  state: DistressTowState,
  ship: WorldPoint,
  shipHeading: number,
  deltaSeconds: number
): DistressTowState {
  const dt = Math.max(0, Math.min(0.05, deltaSeconds));
  if (dt === 0) return state;
  const elapsedSeconds = state.elapsedSeconds + dt;
  const attached = elapsedSeconds >= 0.65;
  if (!attached) return { ...state, elapsedSeconds };
  // The cable attaches to the stern; the damaged ship has mass and momentum.
  const stern = {
    x: ship.x - Math.cos(shipHeading) * 70,
    y: ship.y - Math.sin(shipHeading) * 70,
  };
  const dx = stern.x - state.position.x;
  const dy = stern.y - state.position.y;
  const separation = Math.max(0.001, Math.hypot(dx, dy));
  const stretch = Math.max(0, separation - state.cableLength);
  const nx = dx / separation;
  const ny = dy / separation;
  const radialSpeed = state.velocity.x * nx + state.velocity.y * ny;
  const pull = Math.min(620, stretch * 3.4 - radialSpeed * 1.6);
  const drag = Math.exp(-0.22 * dt);
  const velocity = {
    x: (state.velocity.x + nx * Math.max(0, pull) * dt) * drag,
    y: (state.velocity.y + ny * Math.max(0, pull) * dt) * drag,
  };
  const position = {
    x: state.position.x + velocity.x * dt,
    y: state.position.y + velocity.y * dt,
  };
  const headingRadians = Math.hypot(velocity.x, velocity.y) > 8
    ? Math.atan2(velocity.y, velocity.x)
    : state.headingRadians;
  return {
    ...state,
    position,
    velocity,
    headingRadians,
    elapsedSeconds,
    attached,
    cableTension: Math.min(1, stretch / 180),
  };
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
