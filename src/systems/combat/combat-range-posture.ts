import type { MutableCombatant, CombatPoint } from './strategic-combat-types';
import { normalize } from './strategic-combat-geometry';

export function combatRangePosture(
  combatant: MutableCombatant,
  range: number,
  desired: number,
  toward: CombatPoint,
  perpendicular: CombatPoint
): { direction: CombatPoint; targetSpeedFactor: number } {
  if (range < desired * 0.72) {
    return combatant.setup.aiControlled
      ? { direction: { x: -toward.x, y: -toward.y }, targetSpeedFactor: 0.4 }
      : {
          direction: normalize(
            -toward.x * 0.8 + perpendicular.x * 0.45,
            -toward.y * 0.8 + perpendicular.y * 0.45
          ),
          targetSpeedFactor: 0.72,
        };
  }
  if (range <= desired * 1.18) {
    return combatant.setup.aiControlled
      ? {
          direction: toward,
          targetSpeedFactor: combatant.strategy?.phase === 'reach_range' ? 0.28 : 0.1,
        }
      : {
          direction: normalize(
            perpendicular.x + toward.x * 0.18,
            perpendicular.y + toward.y * 0.18
          ),
          targetSpeedFactor: combatant.tactic === 'kite' ? 0.78 : 0.62,
        };
  }
  if (combatant.tactic === 'kite' && range < desired * 1.5) {
    return {
      direction: normalize(-toward.x * 0.45 + perpendicular.x, -toward.y * 0.45 + perpendicular.y),
      targetSpeedFactor: 0.8,
    };
  }
  return { direction: toward, targetSpeedFactor: 0.88 };
}
