import { shipContact } from './combat-ship-contact-geometry';
import { getShipDefinition } from '../ships';
import { shipShieldGeometry } from '../../core/ship-contact-geometry';
import { resolveContactImpulse, separateContactBodies } from '../../core/contact-impulse';
import { shipContactMassProperties } from '../../core/ship-contact-mass';
import type { MutableCombatant } from './strategic-combat-types';
import type {
  FieldBystanderContact,
  StrategicCombatBystander,
} from './strategic-combat-bystander-types';

function separateBystander(
  ship: MutableCombatant,
  contact: ReturnType<typeof shipContact>,
  field?: FieldBystanderContact
): void {
  const { normal } = contact;
  const overlap = contact.required - contact.distance + 0.5;
  const definition = getShipDefinition(ship.setup.shipId);
  const firstMass = shipContactMassProperties(
    ship.setup.nominalLengthMeters ?? definition?.nominalLengthMeters ?? 60,
    ship.setup.shieldGeometry ?? (definition ? shipShieldGeometry(definition) : undefined)
  ).mass;
  const secondMass = field?.mass ?? 1e30;
  const secondVelocity = field?.pose.velocity ?? { x: 0, y: 0 };
  const firstBody = {
    position: { ...ship.position },
    velocity: { ...ship.velocity },
    mass: firstMass,
  };
  const secondBody = {
    position: { ...(field?.pose.position ?? ship.position) },
    velocity: { ...secondVelocity },
    mass: secondMass,
  };
  separateContactBodies(firstBody, secondBody, normal, overlap);
  const closingSpeed =
    (firstBody.velocity.x - secondBody.velocity.x) * normal.x +
    (firstBody.velocity.y - secondBody.velocity.y) * normal.y;
  if (closingSpeed > 0)
    resolveContactImpulse(firstBody, secondBody, normal, closingSpeed * (field ? 0.1 : 0));

  if (field) {
    const distance =
      (secondBody.position.x - field.pose.position.x) * normal.x +
      (secondBody.position.y - field.pose.position.y) * normal.y;
    const applied = field.apply(normal, distance, {
      x: secondBody.velocity.x - secondVelocity.x,
      y: secondBody.velocity.y - secondVelocity.y,
    });
    if (applied === null) return;
    firstBody.position.x = ship.position.x - normal.x * (overlap - applied);
    firstBody.position.y = ship.position.y - normal.y * (overlap - applied);
  }

  ship.position.x = firstBody.position.x;
  ship.position.y = firstBody.position.y;
  ship.velocity.x = firstBody.velocity.x;
  ship.velocity.y = firstBody.velocity.y;
}

/** Mixed contacts use the field's live correction handle; static bystanders stay immovable. */
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
