import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { distance } from './strategic-combat-geometry';
import { shipContact } from './combat-ship-contact-geometry';

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
  // Only true hull overlap can prevent leaving a reached gate; a pursuer
  // hundreds of meters away cannot impose an invisible escape barrier.
  if (!atExit) return false;
  const contact = shipContact(combatant, enemy);
  return contact.distance > contact.required;
}
