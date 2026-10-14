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
  // Hysteresis prevents reach/align/fire phases oscillating every frame.
  // Once in firing position, keep it until the ship leaves the wider band.
  const holdingFire = plan.phase === 'fire' || plan.phase === 'align_weapons';
  const tooFar = separation > range * (holdingFire ? 1.32 : 1.10);
  const tooNear = separation < range * (holdingFire ? 0.52 : 0.74);
  // After a close-range overshoot, commit to a short regroup instead of
  // immediately oscillating back into fire on the next frame.
  if (plan.phase === 'regroup' && separation < range * 0.86) return 'regroup';
  if (tooNear && plan.phase === 'fire') return 'regroup';
  if (tooFar || tooNear) return 'reach_range';
  if (plan.kind === 'minefield' && ship.mineStock.length === 0) return 'regroup';
  if (plan.kind === 'tractor_lock' && ship.subsystems.tractor <= 0) return 'regroup';
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
  // Weapon orientation also needs hysteresis: enter fire with good alignment,
  // leave only after a noticeably larger error (not every tiny RCS correction).
  const tolerance = plan.phase === 'fire' ? 0.52 : 0.29;
  return Math.abs(error) > tolerance ? 'align_weapons' : 'fire';
}
