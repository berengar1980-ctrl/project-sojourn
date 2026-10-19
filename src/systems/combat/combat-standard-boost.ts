import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { activateCombatBoost, stopCombatBoost, updateCombatBoost } from './combat-boost-control';
import { usefulCombatBoost } from './combat-boost-decision';

/** One boost authority, shared by ramming, retreat and repositioning. */
export function updateStandardCombatBoost(
  ship: MutableCombatant,
  enemy: MutableCombatant,
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
  const wantsBoost = usefulCombatBoost(
    ship,
    enemy,
    distance,
    desiredRange,
    deliberateRam,
    targetSpeedFactor
  );
  if (corridorClear && wantsBoost && facing > 0.8 && (ship.boostSeconds ?? 0) > 0.8)
    activateCombatBoost(ship);
  else stopCombatBoost(ship);
  updateCombatBoost(ship, dt);
  ship.boostRampSeconds =
    ship.boostActive === true ? Math.min(2, (ship.boostRampSeconds ?? 0) + dt) : 0;
}
