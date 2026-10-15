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
  return {
    ...flight,
    initiatorGoal:
      (initiator.tactic === 'flee' ? exitPoint : null) ??
      initiatorSafetyGoal ??
      flight.initiatorGoal,
    reactorGoal:
      (reactor.tactic === 'flee' ? exitPoint : null) ??
      reactorSafetyGoal ??
      flight.reactorGoal,
  };
}
