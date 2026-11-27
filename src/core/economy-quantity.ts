import type { EconomyMarketEntry } from './economy-types';

/** Trade quantities are whole, non-negative units. Non-finite requests are invalid. */
export function wholeQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Market-side accounting is identical for player and NPC purchases and sales. */
export function applyMarketPurchase(entry: EconomyMarketEntry, quantity: number): void {
  entry.stock -= quantity;
  entry.demand = Math.min(1, entry.demand + quantity / 5000);
}

export function applyMarketSale(entry: EconomyMarketEntry, quantity: number): void {
  entry.stock += quantity;
  entry.demand = Math.max(0, entry.demand - quantity / 5000);
}
