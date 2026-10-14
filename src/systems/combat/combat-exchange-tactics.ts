import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { mineBaitManeuver, pursuitManeuver } from './combat-tactical-maneuvers';

/** Allow the same pursuit and mine-lane logic during action/reaction exchanges. */
export function exchangeTacticalGoal(
  ship: MutableCombatant,
  enemy: MutableCombatant
): CombatPoint | null {
  if (!ship.setup.aiControlled) return null;
  const maneuver = pursuitManeuver(ship, enemy) ?? mineBaitManeuver(ship, enemy);
  if (!maneuver) return null;
  return {
    x: ship.position.x + maneuver.direction.x * 380,
    y: ship.position.y + maneuver.direction.y * 380,
  };
}
