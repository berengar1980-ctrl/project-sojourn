import { shipContact } from './combat-ship-contact-geometry';
import type { MutableCombatant, StrategicCombatBystander } from './strategic-combat-types';

/** A third-party NPC is a physical ship, even though PvP weapons only target
 * the two actual duel participants. Never move the civilian through this solver.
 */
export function resolveCombatBystanderContacts(
  combatant: MutableCombatant,
  bystanders: readonly StrategicCombatBystander[]
): void {
  for (const npc of bystanders) {
    if (npc.id === combatant.setup.id) continue;
    const contact = shipContact(combatant, {
      position: npc.position,
      headingRadians: npc.headingRadians,
      setup: { shipId: npc.shipId },
    });
    if (contact.distance >= contact.required) continue;
    const overlap = contact.required - contact.distance + 0.5;
    combatant.position.x -= contact.normal.x * overlap;
    combatant.position.y -= contact.normal.y * overlap;
    const closing = combatant.velocity.x * contact.normal.x + combatant.velocity.y * contact.normal.y;
    if (closing > 0) {
      combatant.velocity.x -= contact.normal.x * closing;
      combatant.velocity.y -= contact.normal.y * closing;
      combatant.speed = Math.hypot(combatant.velocity.x, combatant.velocity.y);
    }
  }
}
