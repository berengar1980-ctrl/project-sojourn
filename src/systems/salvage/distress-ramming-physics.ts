import type { WorldPoint } from '../../core/world-types';

export interface DistressRammingState {
  readonly velocity: WorldPoint;
  readonly previousPlayerPosition: WorldPoint;
  readonly cooldown: number;
  readonly impactAge: number;
  readonly impactPoint: WorldPoint | null;
}

export function createDistressRammingState(player: WorldPoint): DistressRammingState {
  return {
    velocity: { x: 0, y: 0 },
    previousPlayerPosition: { ...player },
    cooldown: 0,
    impactAge: 2,
    impactPoint: null,
  };
}

export function advanceDistressRamming(
  state: DistressRammingState,
  player: WorldPoint,
  wreck: WorldPoint,
  playerRadius: number,
  wreckRadius: number,
  deltaSeconds: number
): { readonly state: DistressRammingState; readonly position: WorldPoint } {
  const dt = Math.max(0, Math.min(0.1, deltaSeconds));
  if (!dt) return { state, position: wreck };
  const velocity = {
    x: state.velocity.x * Math.exp(-0.3 * dt),
    y: state.velocity.y * Math.exp(-0.3 * dt),
  };
  const position = {
    x: wreck.x + velocity.x * dt,
    y: wreck.y + velocity.y * dt,
  };
  const dx = position.x - player.x;
  const dy = position.y - player.y;
  const separation = Math.max(0.001, Math.hypot(dx, dy));
  const nx = dx / separation;
  const ny = dy / separation;
  const playerVelocity = {
    x: (player.x - state.previousPlayerPosition.x) / dt,
    y: (player.y - state.previousPlayerPosition.y) / dt,
  };
  const closingSpeed = (playerVelocity.x - velocity.x) * nx + (playerVelocity.y - velocity.y) * ny;
  const colliding =
    separation < playerRadius + wreckRadius && closingSpeed > 2 && state.cooldown <= 0;
  if (colliding) {
    const impulse = Math.min(300, Math.max(22, closingSpeed * 0.48));
    velocity.x += nx * impulse;
    velocity.y += ny * impulse;
    position.x = player.x + nx * (playerRadius + wreckRadius + 2);
    position.y = player.y + ny * (playerRadius + wreckRadius + 2);
  }
  return {
    position,
    state: {
      velocity,
      previousPlayerPosition: { ...player },
      cooldown: colliding ? 0.65 : Math.max(0, state.cooldown - dt),
      impactAge: colliding ? 0 : state.impactAge + dt,
      impactPoint: colliding
        ? { x: player.x + nx * playerRadius, y: player.y + ny * playerRadius }
        : state.impactPoint,
    },
  };
}
