import { shipContact } from './combat-ship-contact-geometry';
import { getShipDefinition } from '../ships';
import { shipShieldGeometry } from '../../core/ship-contact-geometry';
import type { MutableCombatant } from './strategic-combat-types';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';

/** A third-party NPC is a physical ship, even though PvP weapons only target
 * the two actual duel participants. Never move the civilian through this solver.
 */
export function resolveCombatBystanderContacts(
  combatant: MutableCombatant,
  bystanders: readonly StrategicCombatBystander[],
  resolveFleetBystander?: (ship: MutableCombatant, bystanderId: string) => boolean
): void {
  for (const npc of bystanders) {
    if (npc.id === combatant.setup.id || resolveFleetBystander?.(combatant, npc.id)) continue;
    const definition = getShipDefinition(npc.shipId);
    const contact = shipContact(combatant, {
      position: npc.position,
      headingRadians: npc.headingRadians,
      setup: { shipId: npc.shipId },
      ...(definition ? { hullShieldGeometry: shipShieldGeometry(definition) } : {}),
    });
    if (contact.distance >= contact.required) continue;
    const overlap = contact.required - contact.distance + 0.5;
    combatant.position.x -= contact.normal.x * overlap;
    combatant.position.y -= contact.normal.y * overlap;
    const velocityX = combatant.velocity.x * contact.normal.x;
    const velocityY = combatant.velocity.y * contact.normal.y;
    const closing = velocityX + velocityY;
    if (closing > 0) {
      combatant.velocity.x -= contact.normal.x * closing;
      combatant.velocity.y -= contact.normal.y * closing;
      combatant.speed = Math.hypot(combatant.velocity.x, combatant.velocity.y);
    }
  }
}
