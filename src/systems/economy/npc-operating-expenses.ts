import type { NpcEconomyState } from '../../core/economy-types';

/** Daily crew pay, insurance and berth administration are genuine credit sinks.
 * A ship without liquidity incurs no debt; it may resume paying after a profitable voyage.
 * Travel state does not exempt crews from wages.
 */
export function chargeNpcDailyOperatingExpenses(npc: NpcEconomyState, day: number): number {
  if (!Number.isInteger(day) || day <= 0 || (npc.lastOperatingChargeDay ?? 0) >= day) return 0;
  const elapsed = day - Math.max(0, npc.lastOperatingChargeDay ?? day - 1);
  npc.lastOperatingChargeDay = day;
  // NPCs use the same money they spend on cargo, fuel, repairs and upgrades.
  // Modest fixed costs preserve poor captains' ability to trade while draining idle hoards.
  const base = npc.role === 'freighter' || npc.role === 'trader' ? 80
    : npc.role === 'patrol' ? 55 : 45;
  const premium = Math.ceil(Math.max(0, npc.cargoCapacity) * 0.06);
  const due = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, (base + premium) * elapsed));
  const charged = Math.min(Math.max(0, Math.floor(npc.credits)), due);
  npc.credits -= charged;
  npc.civilianOperatingExpenses = (npc.civilianOperatingExpenses ?? 0) + charged;
  return charged;
}
