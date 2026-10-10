import type {
  CombatTargetSubsystem,
  MutableCombatant,
} from './strategic-combat-types';

/** Engines are exposed only from flank or stern; hull and tractor can be targeted anywhere. */
export function engineShotAvailable(source: MutableCombatant, target: MutableCombatant): boolean {
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
    return target.subsystems.engine > 0 && engineShotAvailable(source, target)
      ? 'engine'
      : 'hull';
  }
  if (selected === 'tractor') return target.subsystems.tractor > 0 ? 'tractor' : 'hull';
  return 'hull';
}
