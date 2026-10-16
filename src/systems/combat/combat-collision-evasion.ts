import type { CombatPoint, MutableCombatant, StrategicCombatSide } from './strategic-combat-types';
import { collisionThreat } from './combat-contact-review';
import { normalize } from './strategic-combat-geometry';

export function predictedCollisionEvasion(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  toward: CombatPoint,
  speedFactor: number
): { direction: CombatPoint; speedFactor: number } | null {
  if (!collisionThreat(combatant, enemy)) return null;
  const sign = side === 'attacker' ? 1 : -1;
  const lateral = { x: -toward.y * sign, y: toward.x * sign };
  return {
    direction: normalize(lateral.x * 2 - toward.x, lateral.y * 2 - toward.y),
    speedFactor: Math.max(0.7, speedFactor),
  };
}


/** Keep a consistent lateral clearance side when a pursuer blocks the exit path. */
export function escapeContactDetour(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  escapeDirection: CombatPoint
): CombatPoint | null {
  const dx = enemy.position.x - combatant.position.x;
  const dy = enemy.position.y - combatant.position.y;
  const ahead = dx * escapeDirection.x + dy * escapeDirection.y;
  const lateral = -escapeDirection.y * dx + escapeDirection.x * dy;
  const distance = Math.hypot(dx, dy);
  if (distance > 230 || ahead < -80 || ahead > 230 || Math.abs(lateral) > 160) {
    delete combatant.escapeAvoidanceSide;
    return null;
  }
  if (!combatant.escapeAvoidanceSide) {
    combatant.escapeAvoidanceSide =
      Math.abs(lateral) > 12 ? (lateral > 0 ? -1 : 1) : side === 'attacker' ? 1 : -1;
  }
  const dodge = combatant.escapeAvoidanceSide;
  return normalize(
    escapeDirection.x * 0.45 - escapeDirection.y * dodge,
    escapeDirection.y * 0.45 + escapeDirection.x * dodge
  );
}
