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
