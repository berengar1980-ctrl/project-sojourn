import type { CombatPoint, MutableCombatant, StrategicCombatSide } from './strategic-combat-types';
import { collisionThreat } from './combat-contact-review';
import { normalize } from './strategic-combat-geometry';

export function predictedCollisionEvasion(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  _side: StrategicCombatSide,
  toward: CombatPoint,
  speedFactor: number
): { direction: CombatPoint; speedFactor: number } | null {
  if (!collisionThreat(combatant, enemy)) return null;
  // Same local passing side gives opposing ships opposite world corridors.
  const lateral = { x: -toward.y, y: toward.x };
  return {
    direction: normalize(lateral.x * 2 - toward.x, lateral.y * 2 - toward.y),
    speedFactor: Math.max(0.7, speedFactor),
  };
}
