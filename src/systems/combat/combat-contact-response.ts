import type { MutableCombatant } from './strategic-combat-types';

export function resolveCombatantCollision(first: MutableCombatant, second: MutableCombatant): void {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const range = Math.hypot(dx, dy);
  const required = 86;
  if (range >= required) return;
  const normal = range > 0.001 ? { x: dx / range, y: dy / range } : { x: 1, y: 0 };
  const overlap = required - range + 1;
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
