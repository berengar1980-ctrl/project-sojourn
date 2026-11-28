import type { MutableCombatant } from './strategic-combat-types';
import { shipContact } from './combat-ship-contact-geometry';
import { resolveContactImpulse, separateContactBodies } from '../../core/contact-impulse';
import { shipContactMassProperties } from '../../core/ship-contact-mass';
import { getShipDefinition } from '../ships';
import { shipShieldGeometry } from '../../core/ship-contact-geometry';

function combatShipMass(combatant: MutableCombatant): number {
  const definition = getShipDefinition(combatant.setup.shipId);
  const nominalLength =
    combatant.setup.nominalLengthMeters ?? definition?.nominalLengthMeters ?? 60;
  const geometry =
    combatant.setup.shieldGeometry ?? (definition ? shipShieldGeometry(definition) : undefined);
  return shipContactMassProperties(nominalLength, geometry).mass;
}

export function resolveCombatantCollision(
  first: MutableCombatant,
  second: MutableCombatant,
  claim?: (firstId: string, secondId: string) => boolean
): boolean {
  const { distance, required, normal } = shipContact(first, second);
  if (distance >= required || claim?.(first.setup.id, second.setup.id) === false) return false;
  const overlap = required - distance + 0.01;
  const firstBody = {
    position: first.position,
    velocity: first.velocity,
    mass: combatShipMass(first),
  };
  const secondBody = {
    position: second.position,
    velocity: second.velocity,
    mass: combatShipMass(second),
  };
  separateContactBodies(firstBody, secondBody, normal, overlap);
  const closingSpeed =
    (first.velocity.x - second.velocity.x) * normal.x +
    (first.velocity.y - second.velocity.y) * normal.y;
  if (closingSpeed > 0) {
    resolveContactImpulse(firstBody, secondBody, normal, closingSpeed * 0.1);
  }
  return true;
}
