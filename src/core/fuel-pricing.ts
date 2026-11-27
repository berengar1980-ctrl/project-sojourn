export const FUEL_PRICE_PER_UNIT = 10;
export const FUEL_DISTANCE_SCALE = 0.025;
export const FUEL_ROUTE_RESERVE = 1.02;
export const MIN_ROUTE_FUEL = 0.1;

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

export function fuelForDistance(
  distance: number,
  shipFuelUse: number,
  pilotingFuelMultiplier = 1,
  engineeringFuelMultiplier = 1
): number {
  const values = [distance, shipFuelUse, pilotingFuelMultiplier, engineeringFuelMultiplier];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return 0;
  const base = distance * shipFuelUse * FUEL_DISTANCE_SCALE;
  return base * pilotingFuelMultiplier * engineeringFuelMultiplier;
}
