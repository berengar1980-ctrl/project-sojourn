export const FUEL_PRICE_PER_UNIT = 10;

export interface FuelQuote {
  readonly units: number;
  readonly cost: number;
}

/** Credit-precise tenths: ten credits buy one fuel unit at every inhabited port. */
export function quoteRefuel(fuel: number, capacity: number, credits: number): FuelQuote {
  const missingTenths = Math.max(0, Math.ceil((capacity - fuel) * FUEL_PRICE_PER_UNIT - 1e-8));
  const payable = Math.min(missingTenths, Math.max(0, Math.floor(credits)));
  return { units: payable / FUEL_PRICE_PER_UNIT, cost: payable };
}
