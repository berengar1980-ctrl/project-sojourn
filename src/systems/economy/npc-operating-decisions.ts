import type { NpcEconomyState } from '../../core/economy-types';
import type { NpcTravelOperatingQuote } from './npc-economy-types';

/** Operating reserves are retained for wages, repairs and fuel, not speculative purchases. */
export function npcWorkingCapital(npc: NpcEconomyState): number {
  // Abstract economy-only actors have no registered hull or capital obligation.
  if (!('shipId' in npc)) return 0;
  const large = (npc.normalCargoCapacity ?? npc.cargoCapacity) >= 200;
  if (npc.role === 'miner') return large ? 450000 : 220000;
  if (npc.role === 'salvager') return large ? 500000 : 250000;
  if (npc.role === 'freighter' || npc.role === 'trader') return large ? 650000 : 300000;
  return 0;
}

export type NpcTravelQuoteFn = (
  npc: NpcEconomyState,
  destinationId: string,
  availableCredits: number
) => NpcTravelOperatingQuote | null;

interface DestinationQuotes {
  direct?: NpcTravelOperatingQuote;
  readonly byBudget: Map<number, NpcTravelOperatingQuote | null>;
}

/**
 * Reuse quotes only within one synchronous decision, before fuel, position,
 * contacts, or blockade state can change. Hypothetical NPCs use separate keys.
 */
export function decisionTravelQuotes(quote?: NpcTravelQuoteFn): NpcTravelQuoteFn | undefined {
  if (!quote) return undefined;
  const byNpc = new WeakMap<NpcEconomyState, Map<string, DestinationQuotes>>();
  return (npc, destinationId, credits) => {
    if (!Number.isFinite(credits) || credits < 0) return quote(npc, destinationId, credits);
    let destinations = byNpc.get(npc);
    if (!destinations) {
      destinations = new Map();
      byNpc.set(npc, destinations);
    }
    let entry = destinations.get(destinationId);
    if (!entry) {
      entry = { byBudget: new Map() };
      destinations.set(destinationId, entry);
    }
    if (entry.direct) return entry.direct;
    const existing = entry.byBudget.get(credits);
    if (existing !== undefined) return existing;
    const result = quote(npc, destinationId, credits);
    if (result?.budgetIndependent) entry.direct = result;
    else entry.byBudget.set(credits, result);
    return result;
  };
}

export interface NpcVoyageEconomics {
  readonly quantity: number;
  readonly distance: number;
  readonly expectedFuelExpense: number;
  readonly netProfit: number;
}

/** Check exact route feasibility after buying cargo; money used to buy goods cannot pay for fuel. */
export function maxAffordableShipment(
  npc: NpcEconomyState,
  destinationId: string,
  maxUnits: number,
  unitCost: number,
  quoteTravel?: NpcTravelQuoteFn
): number {
  const spendable = Math.max(0, npc.credits - npcWorkingCapital(npc));
  const affordable = Math.min(maxUnits, Math.floor(spendable / Math.max(1, unitCost)));
  if (!quoteTravel) return affordable;
  let low = 0;
  let high = affordable;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const creditsAfterPurchase = spendable - mid * unitCost;
    if (quoteTravel(npc, destinationId, creditsAfterPurchase)) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function evaluateNpcPurchaseVoyage(
  npc: NpcEconomyState,
  destinationId: string,
  maxUnits: number,
  buyPrice: number,
  netSalePrice: number,
  straightDistance: number,
  quoteTravel?: NpcTravelQuoteFn
): NpcVoyageEconomics | null {
  const quantity = maxAffordableShipment(npc, destinationId, maxUnits, buyPrice, quoteTravel);
  if (quantity <= 0) return null;
  const quote = quoteTravel?.(npc, destinationId, npc.credits - quantity * buyPrice);
  if (quoteTravel && !quote) return null;
  const expense = quote?.fuelExpense ?? 0;
  const profit = quantity * (netSalePrice - buyPrice) - expense;
  if (profit <= 0) return null;
  return {
    quantity,
    distance: quote?.distance ?? straightDistance,
    expectedFuelExpense: expense,
    netProfit: profit,
  };
}

export function evaluateNpcSaleVoyage(
  npc: NpcEconomyState,
  destinationId: string,
  expectedRevenue: number,
  straightDistance: number,
  quoteTravel?: NpcTravelQuoteFn
): { readonly netRevenue: number; readonly distance: number } | null {
  const quote = quoteTravel?.(npc, destinationId, npc.credits);
  if (quoteTravel && !quote) return null;
  return {
    netRevenue: Math.max(0, expectedRevenue - (quote?.fuelExpense ?? 0)),
    distance: quote?.distance ?? straightDistance,
  };
}

/** Limit ship upgrades until the outstanding damage can be repaired and fuel is affordable. */
export function npcCanInvestAfterMaintenance(
  credits: number,
  componentCost: number,
  repairCost: number,
  fuelReserve: number
): boolean {
  return credits >= componentCost + repairCost + fuelReserve;
}
