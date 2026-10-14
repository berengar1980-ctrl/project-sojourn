import type { MutableCombatant, StrategicCombatArenaOptions, CombatPoint } from './strategic-combat-types';
import { clamp } from './strategic-combat-geometry';

export function applyInertialThrust(
  combatant: MutableCombatant,
  headingError: number,
  targetSpeedFactor: number,
  baseSpeed: number,
  acceleration: number,
  tractorLocked: boolean,
  dt: number,
  arena: StrategicCombatArenaOptions,
  rcsStrafe?: CombatPoint
): void {
  const alignment = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(headingError))));
  const boosted = combatant.boostActive === true;
  const requested = baseSpeed * targetSpeedFactor * alignment * (boosted ? 1.65 : 1);
  const targetSpeed = tractorLocked ? Math.min(requested, 25) : requested;
  const thrust = rcsStrafe ?? {
    x: Math.cos(combatant.headingRadians),
    y: Math.sin(combatant.headingRadians),
  };
  const dx = thrust.x * targetSpeed - combatant.velocity.x;
  const dy = thrust.y * targetSpeed - combatant.velocity.y;
  const change = Math.hypot(dx, dy);
  const slowing = dx * combatant.velocity.x + dy * combatant.velocity.y < 0;
  const fraction = Math.min(
    1,
    (acceleration *
      (boosted ? 1 + 2.5 * Math.min(1, (combatant.boostRampSeconds ?? 0) / 2) : 1) *
      (rcsStrafe ? 0.4 : 1) *
      (slowing ? 1.35 : 1) *
      dt) /
      Math.max(0.001, change)
  );
  combatant.velocity.x += dx * fraction;
  combatant.velocity.y += dy * fraction;
  const speed = Math.hypot(combatant.velocity.x, combatant.velocity.y);
  const limit = tractorLocked ? 25 : baseSpeed * (boosted ? 1.65 : 1.05);
  if (speed > limit) {
    combatant.velocity.x *= limit / speed;
    combatant.velocity.y *= limit / speed;
  }

  const nextX = combatant.position.x + combatant.velocity.x * dt;
  const nextY = combatant.position.y + combatant.velocity.y * dt;
  combatant.position.x = clamp(nextX, EDGE_PADDING, arena.width - EDGE_PADDING);
  combatant.position.y = clamp(nextY, EDGE_PADDING, arena.height - EDGE_PADDING);
  if (nextX !== combatant.position.x) combatant.velocity.x = 0;
  if (nextY !== combatant.position.y) combatant.velocity.y = 0;
  combatant.speed = Math.hypot(combatant.velocity.x, combatant.velocity.y);
}

