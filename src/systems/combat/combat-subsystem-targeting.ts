import { isSecurityDrone } from '../../core/security-drone';
import type { CombatTargetSubsystem, MutableCombatant } from './strategic-combat-types';

/** Engines are exposed only from flank or stern; hull and tractor can be targeted anywhere. */
export function engineShotAvailable(
  source: Pick<MutableCombatant, 'position'>,
  target: MutableCombatant
): boolean {
  if (isSecurityDrone(target.setup.id)) return true;
  const bearing = Math.atan2(
    source.position.y - target.position.y,
    source.position.x - target.position.x
  );
  const relative = Math.atan2(
    Math.sin(bearing - target.headingRadians),
    Math.cos(bearing - target.headingRadians)
  );
  return Math.abs(relative) >= Math.PI / 3;
}

/** Never suppress all fire just because engines are not exposed.
 * The target resolver already falls back to hull when no engine shot exists.
 */
export function canEngagePreferredSubsystem(
  _source: MutableCombatant,
  _target: MutableCombatant
): boolean {
  return true;
}

export function effectiveTargetSubsystem(
  source: MutableCombatant,
  target: MutableCombatant
): CombatTargetSubsystem {
  if (target.shieldHp > 0) return 'hull';
  if (target.tactic === 'flee' && target.subsystems.engine > 0) {
    return engineShotAvailable(source, target) ? 'engine' : 'hull';
  }
  const selected = source.strategy?.targetSubsystem ?? 'hull';
  if (selected === 'engine') {
    return target.subsystems.engine > 0 && engineShotAvailable(source, target) ? 'engine' : 'hull';
  }
  if (selected === 'tractor') return target.subsystems.tractor > 0 ? 'tractor' : 'hull';
  return 'hull';
}
