import { shipContact, type ShipContact } from './combat-ship-contact-geometry';
import { getShipDefinition } from '../ships';
import {
  shipShieldGeometry,
  weightedContactSeparation,
} from '../../core/ship-contact-geometry';
import type { MutableCombatant } from './strategic-combat-types';
import type {
  FieldBystanderContact,
  StrategicCombatBystander,
} from './strategic-combat-bystander-types';

function separateBystander(
  ship: MutableCombatant,
  contact: ShipContact,
  field?: FieldBystanderContact
): void {
  const { normal } = contact;
  const overlap = contact.required - contact.distance + 0.5;
  const ownClosing = ship.velocity.x * normal.x + ship.velocity.y * normal.y;
  let move = overlap;
  let impulse = Math.max(0, ownClosing);
  if (field) {
    const alongBow =
      normal.x * Math.cos(field.pose.headingRadians) + normal.y * Math.sin(field.pose.headingRadians);
    const relativeClosing = Math.max(0, ownClosing - (field.pose.speed ?? 0) * alongBow);
    const shares = weightedContactSeparation(overlap, 1, field.pushWeight);
    const response = weightedContactSeparation(relativeClosing, 1, field.pushWeight);
    const applied = field.apply(normal, shares.second, response.second);
    if (applied === null) return;
    move -= applied;
    impulse = response.first;
  }
  ship.position.x -= normal.x * move;
  ship.position.y -= normal.y * move;
  if (impulse > 0) {
    ship.velocity.x -= normal.x * impulse;
    ship.velocity.y -= normal.y * impulse;
    ship.speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  }
}

/** Mixed contacts use the field's live correction handle, never a second integration.
 * Unbound bystanders retain the existing read-only collider behavior.
 */
export function resolveCombatBystanderContacts(
  combatant: MutableCombatant,
  bystanders: readonly StrategicCombatBystander[],
  resolveFleetBystander?: (ship: MutableCombatant, bystanderId: string) => boolean,
  claim?: (firstId: string, secondId: string) => boolean
): void {
  for (const npc of bystanders) {
    if (npc.id === combatant.setup.id || resolveFleetBystander?.(combatant, npc.id)) continue;
    const definition = getShipDefinition(npc.shipId);
    const pose = npc.fieldContact?.pose ?? npc;
    const contact = shipContact(combatant, {
      position: pose.position,
      headingRadians: pose.headingRadians,
      setup: { shipId: npc.shipId },
      ...(definition ? { hullShieldGeometry: shipShieldGeometry(definition) } : {}),
    });
    if (contact.distance >= contact.required || claim?.(combatant.setup.id, npc.id) === false)
      continue;
    separateBystander(combatant, contact, npc.fieldContact);
  }
}
