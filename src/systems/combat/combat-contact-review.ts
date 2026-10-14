import type {
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';

export function collisionThreat(first: MutableCombatant, second: MutableCombatant): boolean {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const vx = second.velocity.x - first.velocity.x;
  const vy = second.velocity.y - first.velocity.y;
  const separation = Math.hypot(dx, dy);
  if (separation <= 86) return true;
  const relativeSpeedSquared = vx * vx + vy * vy;
  if (relativeSpeedSquared < 0.001) return false;
  const time = Math.max(0, Math.min(4, -(dx * vx + dy * vy) / relativeSpeedSquared));
  if (time <= 0 || time >= 4) return false;
  return Math.hypot(dx + vx * time, dy + vy * time) < 166;
}

export function reviewShipContact(
  runtime: StrategicCombatRuntime,
  review: (ship: MutableCombatant, enemy: MutableCombatant, side: StrategicCombatSide) => void
): void {
  if (!collisionThreat(runtime.attacker, runtime.defender)) return;
  for (const [side, ship, enemy] of [
    ['attacker', runtime.attacker, runtime.defender],
    ['defender', runtime.defender, runtime.attacker],
  ] as const) {
    // Contact may not bypass the first staggered four-second analysis window.
    if (!ship.strategy && ship.nextStrategyReviewAt > runtime.elapsedSeconds) continue;
    if (runtime.elapsedSeconds - (ship.lastContactReviewAt ?? -100) < 2) continue;
    ship.lastContactReviewAt = runtime.elapsedSeconds;
    ship.nextStrategyReviewAt = runtime.elapsedSeconds;
    review(ship, enemy, side);
  }
}
