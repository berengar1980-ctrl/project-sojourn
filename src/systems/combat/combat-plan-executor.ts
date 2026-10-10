import type { CombatDoctrine, CombatPlanPhase, MutableCombatant } from './strategic-combat-types';
import { distance, wrapAngle } from './strategic-combat-geometry';

export function classifyCombatDoctrine(
  ship: MutableCombatant,
  enemy: MutableCombatant
): CombatDoctrine {
  const plan = ship.strategy;
  if (ship.tactic === 'flee' || plan?.kind === 'escape') return 'escape';
  if (plan?.kind === 'minefield') return 'minefield';
  if (plan?.kind === 'tractor_lock') return 'tractor_intercept';
  if (enemy.tactic === 'flee' && enemy.subsystems.engine > 0) return 'engine_intercept';
  if (plan?.kind === 'broadside') return 'broadside';
  if (plan?.kind === 'skirmish') return 'range_control';
  return enemy.shieldHp > 0 ? 'shield_breaker' : 'hull_breaker';
}

/** Evaluate prerequisite conditions continuously, without changing the strategic doctrine. */
export function executeCombatPlan(
  ship: MutableCombatant,
  enemy: MutableCombatant
): CombatPlanPhase {
  const plan = ship.strategy;
  if (!plan) return 'regroup';
  const separation = distance(ship.position, enemy.position);
  const range = plan.desiredRange;
  const tooFar = separation > range * 1.2;
  const tooNear = separation < range * 0.62;
  if (tooFar || tooNear) return 'reach_range';
  if (plan.focus === 'turret' || plan.focus === 'mine') return 'fire';
  const bearing = Math.atan2(
    enemy.position.y - ship.position.y,
    enemy.position.x - ship.position.x
  );
  const mountFacing =
    plan.focus === 'broadside'
      ? plan.broadsideFacing === 'starboard'
        ? Math.PI / 2
        : -Math.PI / 2
      : 0;
  const error = wrapAngle(bearing - ship.headingRadians - mountFacing);
  return Math.abs(error) > 0.35 ? 'align_weapons' : 'fire';
}
