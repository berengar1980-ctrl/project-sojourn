import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { activateCombatBoost, stopCombatBoost, updateCombatBoost } from './combat-boost';

/** Automatic boost in ordinary fights, using the shared boost tank and recharge. */
export function updateStandardCombatBoost(
  ship: MutableCombatant,
  headingDirection: CombatPoint,
  distance: number,
  desiredRange: number,
  targetSpeedFactor: number,
  deliberateRam: boolean,
  corridorClear: boolean,
  dt: number
): void {
  const facing =
    Math.cos(ship.headingRadians) * headingDirection.x +
    Math.sin(ship.headingRadians) * headingDirection.y;
  const wantsBoost =
    ship.tactic === 'flee' ||
    deliberateRam ||
    (distance > Math.max(650, desiredRange * 1.45) && targetSpeedFactor > 0.7);
  if (corridorClear && wantsBoost && facing > 0.7 && (ship.boostSeconds ?? 0) > 0.8)
    activateCombatBoost(ship);
  else stopCombatBoost(ship);
  updateCombatBoost(ship, dt);
  ship.boostRampSeconds =
    ship.boostActive === true ? Math.min(2, (ship.boostRampSeconds ?? 0) + dt) : 0;
}
