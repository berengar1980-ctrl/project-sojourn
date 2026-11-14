import type { ControllerRuntimeContext } from './game-controller-runtime-types';

export interface LegalPayment {
  readonly paid: number;
  readonly remainingDebt: number;
}

/** Every settlement debits the debtor and credits the lawful owners once. */
export function transferCredit(
  context: ControllerRuntimeContext,
  creditorId: string,
  amount: number
): void {
  if (amount <= 0) return;
  if (creditorId === 'player') {
    context.economy.trade.player.credits += amount;
    context.systemLog.write('KONZESSION > ENTSCHAEDIGUNG EINGEGANGEN: +' + amount + ' CR');
    return;
  }
  const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === creditorId);
  if (npc) npc.credits += amount;
}

/** Shared for player, NPC miners, patrol inspections and docking. */
export function settleLegalDebt(
  context: ControllerRuntimeContext,
  shipId: string,
  debtor: { credits: number }
): LegalPayment {
  const payment = context.economy.legal.settle(shipId, debtor.credits);
  debtor.credits -= payment.paid;
  for (const transfer of payment.transfers)
    transferCredit(context, transfer.creditorId, transfer.amount);
  return { paid: payment.paid, remainingDebt: context.economy.legal.debt(shipId) };
}
