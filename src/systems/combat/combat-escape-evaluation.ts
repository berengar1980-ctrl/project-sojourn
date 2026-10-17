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
  const gate = combatant.escapeGate ?? arena.exitPoint;
  const atExit = gate !== undefined && distance(combatant.position, gate) <= 90;
  // Reaching a valid, fixed exit completes the escape. The old arbitrary
  // 350–600 m clearance rule could strand ships against the arena boundary
  // indefinitely while a similarly fast pursuer shadowed them. Actual
  // tractor interception above remains a deliberate escape-blocking mechanic.
  return atExit;
}
