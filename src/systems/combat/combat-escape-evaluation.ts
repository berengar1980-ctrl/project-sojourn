import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { distance } from './strategic-combat-geometry';

export function runtimeCombatantEscaped(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): boolean {
  if (combatant.tactic !== 'flee') return false;
  if (
    combatant.shieldHp <= 0 &&
    enemy.hullHp > 0 &&
    enemy.subsystems.tractor > 0 &&
    distance(combatant.position, enemy.position) <= (enemy.setup.tractorRangeMeters ?? 0)
  )
    return false;
  const atExit =
    arena.exitPoint !== undefined && distance(combatant.position, arena.exitPoint) <= 90;
  const safeSeparation = Math.max(350, Math.min(600, arena.width * 0.2));
  return atExit && distance(combatant.position, enemy.position) > safeSeparation;
}
