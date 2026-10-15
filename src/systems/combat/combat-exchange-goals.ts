import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import type { ExchangeFlightPlan } from './combat-exchange-pilot';

/**
 * The exchange scheduler owns planned trajectories. Only an explicit escape
 * order or a transient safety reaction may override its committed destination.
 * Navigation may route around hazards without rewriting this plan.
 */
export function resolveExchangeFlightGoals(
  flight: ExchangeFlightPlan,
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  exitPoint: CombatPoint | undefined,
  initiatorSafetyGoal: CombatPoint | null,
  reactorSafetyGoal: CombatPoint | null
): ExchangeFlightPlan {
  const initiatorEscape = initiator.tactic === 'flee' ? exitPoint : null;
  const reactorEscape = reactor.tactic === 'flee' ? exitPoint : null;
  return {
    ...flight,
    initiatorGoal: initiatorEscape ?? initiatorSafetyGoal ?? flight.initiatorGoal,
    reactorGoal: reactorEscape ?? reactorSafetyGoal ?? flight.reactorGoal,
  };
}
