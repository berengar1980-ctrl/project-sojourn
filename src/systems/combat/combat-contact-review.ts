import type { MutableCombatant } from './strategic-combat-types';

export function collisionThreat(first: MutableCombatant, second: MutableCombatant): boolean {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const vx = second.velocity.x - first.velocity.x;
  const vy = second.velocity.y - first.velocity.y;
  const separation = Math.hypot(dx, dy);
  if (separation <= 86) return true;
  const relativeSpeedSquared = vx * vx + vy * vy;
  if (relativeSpeedSquared < 0.001) return false;
  const time = Math.max(0, Math.min(4, -(dx * vx + dy * vy) / relativeSpeedSquared));
  if (time <= 0 || time >= 4) return false;
  return Math.hypot(dx + vx * time, dy + vy * time) < 166;
}
