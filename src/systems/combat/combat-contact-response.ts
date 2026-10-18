import type { MutableCombatant } from './strategic-combat-types';
import { shipContact } from './combat-ship-contact-geometry';

export function resolveCombatantCollision(first: MutableCombatant, second: MutableCombatant): void {
  const { distance, required, normal } = shipContact(first, second);
  if (distance >= required) return;
  const overlap = required - distance + 0.01;
  first.position.x -= normal.x * overlap * 0.5;
  first.position.y -= normal.y * overlap * 0.5;
  second.position.x += normal.x * overlap * 0.5;
  second.position.y += normal.y * overlap * 0.5;
  // Resolve only the closing component along the hull-contact normal.
  // Multiplying both complete velocity vectors by 0.6 every frame erased
  // tangential motion and made an escaping ship stick to its pursuer.
  const relativeX = first.velocity.x - second.velocity.x;
  const relativeY = first.velocity.y - second.velocity.y;
  const closingSpeed = relativeX * normal.x + relativeY * normal.y;
  if (closingSpeed > 0) {
    const impulse = closingSpeed * 0.55;
    first.velocity.x -= normal.x * impulse;
    first.velocity.y -= normal.y * impulse;
    second.velocity.x += normal.x * impulse;
    second.velocity.y += normal.y * impulse;
  }
  first.speed = Math.hypot(first.velocity.x, first.velocity.y);
  second.speed = Math.hypot(second.velocity.x, second.velocity.y);
}
