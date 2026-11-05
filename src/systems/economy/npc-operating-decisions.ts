import type { NpcEconomyState } from '../../core/economy-types';
import type { NpcTravelOperatingQuote } from './npc-economy-types';

export type NpcTravelQuoteFn = (
  npc: NpcEconomyState,
  destinationId: string,
  availableCredits: number
) => NpcTravelOperatingQuote | null;

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
  if (!quoteTravel) return maxUnits;
  let low = 0;
  let high = maxUnits;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const creditsAfterPurchase = npc.credits - mid * unitCost;
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
