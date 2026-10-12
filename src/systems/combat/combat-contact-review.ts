import type { MutableCombatant, StrategicCombatRuntime, StrategicCombatSide } from './strategic-combat-types';
import { distance } from './strategic-combat-geometry';

export function reviewShipContact(
  runtime: StrategicCombatRuntime,
  review: (ship: MutableCombatant, enemy: MutableCombatant, side: StrategicCombatSide) => void
): void {
  if (distance(runtime.attacker.position, runtime.defender.position) >= 86) return;
  for (const [side, ship, enemy] of [
    ['attacker', runtime.attacker, runtime.defender],
    ['defender', runtime.defender, runtime.attacker],
  ] as const) {
    if (runtime.elapsedSeconds - (ship.lastContactReviewAt ?? -100) < 2) continue;
    ship.lastContactReviewAt = runtime.elapsedSeconds;
    ship.nextStrategyReviewAt = runtime.elapsedSeconds;
    review(ship, enemy, side);
  }
}
