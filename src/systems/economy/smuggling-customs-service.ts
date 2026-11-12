import type { PlayerEconomyState } from '../../core/economy-types';
import { economyResourceById, isIllegalResource } from '../../data/economy/economy-resources';
import type {
  ContrabandDetection,
  CustomsAction,
  CustomsInspection,
  CustomsOutcome,
  CustomsSource,
  SmugglingService,
  SmugglingState,
} from './smuggling-service';
import { HIDDEN_CARGO_HOLD } from './smuggling-service';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function illegalCargo(player: PlayerEconomyState): ContrabandDetection[] {
  return Object.entries(player.cargo)
    .filter(([id, lot]) => isIllegalResource(id) && lot.qty > 0)
    .map(([id, lot]) => {
      const hiddenQty = clamp(lot.hiddenQty ?? 0, 0, lot.qty);
      const visibleQty = Math.max(0, lot.qty - hiddenQty);
      return { id, hiddenQty, visibleQty, qty: hiddenQty + visibleQty };
    });
}
function scanCargo(
  player: PlayerEconomyState,
  state: SmugglingState,
  strength: number,
  concealment: number,
  rng: () => number
): ContrabandDetection[] {
  const detected: ContrabandDetection[] = [];
  for (const cargo of illegalCargo(player)) {
    const visibleQty =
      rng() < clamp(0.58 + strength * 0.36 + state.suspicion * 0.002, 0.45, 0.99)
        ? cargo.visibleQty
        : 0;
    const hiddenQty =
      rng() < clamp(0.16 + strength * 0.5 - concealment * 0.4 + state.suspicion * 0.0015, 0.03, 0.58)
        ? cargo.hiddenQty
        : 0;
    if (visibleQty + hiddenQty > 0) {
      detected.push({ id: cargo.id, visibleQty, hiddenQty, qty: visibleQty + hiddenQty });
    }
  }
  return detected;
}
function removeSeizedCargo(player: PlayerEconomyState, detected: readonly ContrabandDetection[]) {
  let totalValue = 0;
  let seized = 0;
  let hiddenFound = false;
  for (const item of detected) {
    const lot = player.cargo[item.id];
    if (!lot) continue;
    const visible = Math.min(Math.max(0, lot.qty - (lot.hiddenQty ?? 0)), item.visibleQty);
    const hidden = Math.min(lot.hiddenQty ?? 0, item.hiddenQty);
    const quantity = Math.min(lot.qty, visible + hidden);
    if (quantity <= 0) continue;
    hiddenFound ||= hidden > 0;
    const averageCost = lot.qty > 0 ? lot.totalCost / lot.qty : 0;
    lot.qty -= quantity;
    lot.hiddenQty = Math.max(0, (lot.hiddenQty ?? 0) - hidden);
    lot.totalCost = Math.max(0, lot.totalCost - averageCost * quantity);
    if (lot.qty <= 0) delete player.cargo[item.id];
    totalValue += quantity * (economyResourceById(item.id)?.basePrice ?? 0);
    seized += quantity;
  }
  return { totalValue, seized, hiddenFound };
}
function confiscateCargo(
  player: PlayerEconomyState,
  state: SmugglingState,
  detected: readonly ContrabandDetection[],
  obstruction: boolean,
  adjustSuspicion: (delta: number) => void
): string {
  const { totalValue, seized, hiddenFound } = removeSeizedCargo(player, detected);
  const fine = Math.round(
    (50000 + totalValue * 1.5) * (1 + (hiddenFound ? 0.5 : 0) + (obstruction ? 0.25 : 0))
  );
  player.credits -= fine;
  adjustSuspicion(8 + (hiddenFound ? 12 : 0) + (obstruction ? 18 : 0));
  return `${seized} t Kontrabande beschlagnahmt · Geldstrafe ${fine.toLocaleString('de-DE')} CR`;
}
function finish(inspection: CustomsInspection, outcome: CustomsOutcome, summary: string) {
  inspection.stage = 'result';
  inspection.outcome = outcome;
  inspection.summary = summary;
  return inspection;
}
interface DecisionContext {
  readonly player: PlayerEconomyState;
  readonly state: SmugglingState;
  readonly scan: SmugglingService['scan'];
  readonly bribeQuote: SmugglingService['bribeQuote'];
  readonly adjustSuspicion: (delta: number) => void;
}
function performInspection(
  ctx: DecisionContext,
  inspection: CustomsInspection,
  shipId: string,
  rng: () => number,
  obstruction: boolean,
  strengthBonus = 0
): CustomsInspection {
  const detected = ctx.scan(clamp(inspection.strength + strengthBonus, 0, 1), shipId, rng);
  if (detected.length) {
    return finish(
      inspection,
      'seized',
      confiscateCargo(ctx.player, ctx.state, detected, obstruction, ctx.adjustSuspicion)
    );
  }
  ctx.adjustSuspicion(-2);
  return finish(inspection, 'clear', 'Kontrolle ohne Befund · Schiff freigegeben');
}
function attemptPapers(ctx: DecisionContext, inspection: CustomsInspection, rng: () => number) {
  inspection.papersTried = true;
  const chance = clamp(
    0.38 - inspection.strength * 0.16 - ctx.state.suspicion * 0.003,
    0.08,
    0.76
  );
  if (rng() < chance) {
    ctx.adjustSuspicion(-2);
    return finish(inspection, 'papers', 'Frachtpapiere akzeptiert · keine Durchsuchung');
  }
  ctx.adjustSuspicion(4);
  return inspection;
}
function attemptBribe(
  ctx: DecisionContext,
  inspection: CustomsInspection,
  shipId: string,
  capacity: number,
  rng: () => number
) {
  const quote = ctx.bribeQuote(capacity);
  if (ctx.player.credits < quote) return inspection;
  inspection.bribeTried = true;
  const chance = clamp(
    0.56 - inspection.strength * 0.25 - ctx.state.suspicion * 0.0022,
    0.08,
    0.62
  );
  if (rng() < chance) {
    ctx.player.credits -= quote;
    ctx.adjustSuspicion(3);
    return finish(inspection, 'bribe', 'Diskrete Zahlung von ' + quote + ' CR akzeptiert');
  }
  ctx.adjustSuspicion(15);
  return performInspection(ctx, inspection, shipId, rng, true, 0.14);
}
function attemptFlee(
  ctx: DecisionContext,
  inspection: CustomsInspection,
  shipId: string,
  rng: () => number
) {
  if (rng() < 0.5) {
    ctx.adjustSuspicion(20);
    return finish(inspection, 'escaped', 'Flucht vor der Patrouille gelungen');
  }
  ctx.adjustSuspicion(18);
  return performInspection(ctx, inspection, shipId, rng, true, 0.18);
}
function resolveCustomsDecision(
  ctx: DecisionContext,
  action: CustomsAction,
  shipId: string,
  normalCapacity: number,
  rng: () => number
): CustomsInspection | null {
  const inspection = ctx.state.inspection;
  if (!inspection) return null;
  if (action === 'ack' && inspection.stage === 'result') {
    ctx.state.inspection = null;
    return null;
  }
  if (inspection.stage !== 'request') return inspection;
  if (action === 'papers' && !inspection.papersTried) return attemptPapers(ctx, inspection, rng);
  if (action === 'bribe' && inspection.source === 'harbor' && !inspection.bribeTried) {
    return attemptBribe(ctx, inspection, shipId, normalCapacity, rng);
  }
  if (action === 'flee' && inspection.source === 'patrol') {
    return attemptFlee(ctx, inspection, shipId, rng);
  }
  if (action === 'fight' && inspection.source === 'patrol') {
    ctx.adjustSuspicion(35);
    return finish(inspection, 'resisted', 'Widerstand gegen die Flottenkontrolle');
  }
  if (action === 'comply') {
    return performInspection(ctx, inspection, shipId, rng, false, inspection.papersTried ? 0.05 : 0);
  }
  return inspection;
}
export function createSmugglingCustomsService(
  player: PlayerEconomyState,
  state: SmugglingState,
  hiddenCapacity: SmugglingService['hiddenCapacity'],
  adjustSuspicion: (delta: number) => void
): Pick<
  SmugglingService,
  'scan' | 'inspectionChance' | 'startInspection' | 'bribeQuote' | 'decide'
> {
  const scan: SmugglingService['scan'] = (strength, shipId, rng = Math.random) =>
    scanCargo(player, state, strength, hiddenCapacity(shipId) > 0 ? HIDDEN_CARGO_HOLD.concealment : 0, rng);
  const bribeQuote = (normalCapacity: number): number =>
    Math.max(
      4000,
      Math.round((5500 + normalCapacity * 110 + state.suspicion * 260) / 500) * 500
    );
  const ctx: DecisionContext = { player, state, scan, bribeQuote, adjustSuspicion };
  return {
    scan,
    bribeQuote,
    inspectionChance(source: CustomsSource, security, shipId) {
      const strength = security === 'high' ? 0.76 : security === 'medium' ? 0.52 : 0.3;
      const cargo = illegalCargo(player);
      const count = cargo.reduce((sum, item) => sum + item.qty, 0);
      const visible = cargo.reduce((sum, item) => sum + item.visibleQty, 0);
      const hidden = cargo.reduce((sum, item) => sum + item.hiddenQty, 0);
      const exposure =
        count === 0
          ? 0
          : clamp(
              (visible +
                hidden * (1 - (hiddenCapacity(shipId) > 0 ? HIDDEN_CARGO_HOLD.concealment : 0) * 0.78)) /
                count,
              0.1,
              1
            );
      if (count === 0) {
        return clamp(0.03 * (0.65 + strength * 0.45) + state.suspicion * 0.00035, 0.008, 0.14);
      }
      return source === 'harbor'
        ? clamp(
            (0.05 + strength * 0.38 + state.suspicion * 0.0035) * (0.55 + 0.45 * exposure),
            0.03,
            0.8
          )
        : clamp(
            (0.07 + strength * 0.3 + state.suspicion * 0.003) * (0.55 + 0.45 * exposure),
            0.05,
            0.68
          );
    },
    startInspection(source, locationId, strength, patrolId) {
      if (state.inspection) return false;
      state.inspection = {
        source,
        locationId,
        ...(patrolId ? { patrolId } : {}),
        strength: clamp(strength, 0, 1),
        stage: 'request',
        papersTried: false,
        bribeTried: false,
      };
      return true;
    },
    decide(action, shipId, normalCapacity, rng = Math.random) {
      return resolveCustomsDecision(ctx, action, shipId, normalCapacity, rng);
    },
  };
}
