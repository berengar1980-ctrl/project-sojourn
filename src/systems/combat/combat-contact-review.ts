import type {
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';
import { shipContact } from './combat-ship-contact-geometry';
import { predictsClosingContact } from '../../core/field-geometry';

export function collisionThreat(first: MutableCombatant, second: MutableCombatant): boolean {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const vx = second.velocity.x - first.velocity.x;
  const vy = second.velocity.y - first.velocity.y;
  const contact = shipContact(first, second);
  // Predictive avoidance gets a modest clearance buffer, but never applies
  // forces. Only the shared physical hull geometry can resolve a collision.
  return predictsClosingContact(dx, dy, vx, vy, contact.required + 34, 4);
}

export function reviewShipContact(
  runtime: StrategicCombatRuntime,
  review: (ship: MutableCombatant, enemy: MutableCombatant, side: StrategicCombatSide) => void,
  drivenSide?: StrategicCombatSide
): void {
  // Only real hull contact interrupts the fixed eight-second strategy cadence.
  const contact = shipContact(runtime.attacker, runtime.defender);
  if (contact.distance > contact.required) return;
  for (const [side, ship, enemy] of [
    ['attacker', runtime.attacker, runtime.defender],
    ['defender', runtime.defender, runtime.attacker],
  ] as const) {
    if (drivenSide && side !== drivenSide) continue;
    // Contact may not bypass the first staggered four-second analysis window.
    if (
      ship.setup?.aiControlled &&
      !ship.strategy &&
      ship.nextStrategyReviewAt > runtime.elapsedSeconds
    )
      continue;
    if (runtime.elapsedSeconds - (ship.lastContactReviewAt ?? -100) < 2) continue;
    ship.lastContactReviewAt = runtime.elapsedSeconds;
    ship.nextStrategyReviewAt = runtime.elapsedSeconds;
    review(ship, enemy, side);
  }
}
