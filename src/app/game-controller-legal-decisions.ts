import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { createLegalDemandPanel, type LegalDemandPanel } from '../ui/legal/legal-demand-panel';
import { settleLegalDebt } from './game-controller-legal-ledger';

const pending = new WeakMap<ControllerRuntimeContext, LegalDemandPanel>();

export function hasPendingLegalDemand(context: ControllerRuntimeContext): boolean {
  return pending.has(context);
}

/** Present the same invoice before any warrant is declared. */
export function offerLegalDemand(
  context: ControllerRuntimeContext,
  shipId: string,
  title: string,
  onRefused: () => void
): boolean {
  if (pending.has(context)) return false;
  const debt = context.economy.legal.debt(shipId);
  if (debt <= 0) return false;
  const canPay = context.economy.trade.player.credits >= debt;
  const panel = createLegalDemandPanel(
    context.root,
    title,
    'Offene Forderung: ' + debt + ' CR.\n' +
      'Bezahlung schließt die Forderung. Verweigerung kann zur Fahndung führen.',
    canPay,
    (decision) => {
      pending.delete(context);
      if (decision === 'pay' && canPay) {
        const result = settleLegalDebt(context, shipId, context.economy.trade.player);
        context.systemLog.write('RECHTSREGISTER > ' + result.paid + ' CR BEGLICHEN');
        return;
      }
      context.economy.legal.declareWanted(shipId);
      onRefused();
    }
  );
  pending.set(context, panel);
  return true;
}
