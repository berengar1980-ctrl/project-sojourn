import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { activateExchangeBoost, stopExchangeBoost } from './combat-exchange-pilot';

/** Apply existing boost rules without granting boost control over flight goals. */
export function useBoostForExchange(
  ship: MutableCombatant,
  goal: CombatPoint,
  urgent: boolean,
  separation: number,
  remaining: number
): void {
  const dx = goal.x - ship.position.x;
  const dy = goal.y - ship.position.y;
  const range = Math.hypot(dx, dy);
  const aligned = dx * Math.cos(ship.headingRadians) + dy * Math.sin(ship.headingRadians);
  const forwardSpeed =
    ship.velocity.x * Math.cos(ship.headingRadians) +
    ship.velocity.y * Math.sin(ship.headingRadians);
  const fleeing = ship.tactic === 'flee';
  const pursuit = !fleeing && separation > 600 && range > 350;
  const ready = (ship.boostSeconds ?? 0) > 0.8;
  const useful =
    (urgent || fleeing || pursuit) &&
    ready &&
    separation > (fleeing ? 180 : 250) &&
    range > 180 &&
    aligned > range * 0.7 &&
    forwardSpeed >= 0 &&
    !ship.asteroidRoute?.length &&
    remaining > 0.7;
  if (useful) activateExchangeBoost(ship);
  else stopExchangeBoost(ship);
}
