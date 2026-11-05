import type { ShipDefinition } from '../../core/ship-types';
import { getShipRoleProfile } from '../../data/ships/ship-role-profiles';
import type { PlayerTradeService } from '../economy/player-trade-service';
import { FUEL_DISTANCE_SCALE } from '../npcs/npc-sector-routing';

export const FUEL_PRICE_PER_UNIT = 10;
export const REPAIR_PRICE_PER_HULL_HP = 100;
export const SHIPYARD_REPAIR_MULTIPLIER = 0.8;

export interface FuelQuote {
  readonly units: number;
  readonly cost: number;
}

export interface RepairQuote {
  readonly points: number;
  readonly cost: number;
}

export function fuelForDistance(
  distance: number,
  shipFuelUse: number,
  pilotingFuelMultiplier = 1,
  engineeringFuelMultiplier = 1
): number {
  const values = [distance, shipFuelUse, pilotingFuelMultiplier, engineeringFuelMultiplier];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return 0;
  return distance * shipFuelUse * FUEL_DISTANCE_SCALE *
    pilotingFuelMultiplier * engineeringFuelMultiplier;
}

/** Credit-precise tenths: ten credits buy one fuel unit at every inhabited port. */
export function quoteRefuel(fuel: number, capacity: number, credits: number): FuelQuote {
  const missingTenths = Math.max(0, Math.ceil((capacity - fuel) * FUEL_PRICE_PER_UNIT - 1e-8));
  const payable = Math.min(missingTenths, Math.max(0, Math.floor(credits)));
  return { units: payable / FUEL_PRICE_PER_UNIT, cost: payable };
}

export function repairCost(
  points: number,
  shipyard: boolean,
  engineeringMultiplier = 1
): number {
  if (points <= 0 || !Number.isFinite(points)) return 0;
  const engineering = Math.max(0, Math.min(1, engineeringMultiplier));
  return Math.ceil(
    points * REPAIR_PRICE_PER_HULL_HP *
      (shipyard ? SHIPYARD_REPAIR_MULTIPLIER : 1) * engineering
  );
}

export function quoteRepair(
  currentHp: number,
  maximumHp: number,
  credits: number,
  shipyard: boolean,
  engineeringMultiplier = 1
): RepairQuote {
  const missing = Math.max(0, Math.ceil(maximumHp - currentHp));
  const funds = Math.max(0, Math.floor(credits));
  let points = missing;
  while (points > 0 && repairCost(points, shipyard, engineeringMultiplier) > funds) points--;
  return { points, cost: repairCost(points, shipyard, engineeringMultiplier) };
}

interface HullState {
  fuel: number;
  damage: number;
}

export interface ShipOperatingSnapshot {
  readonly fuel: number;
  readonly fuelCapacity: number;
  readonly hullHp: number;
  readonly hullMaxHp: number;
}

export interface ShipOperatingRecord {
  readonly shipId: string;
  readonly fuel: number;
  readonly damage: number;
}

export interface ShipOperatingService {
  /** Detached observational snapshot, not a savegame schema. */
  snapshotAll(): { readonly hulls: readonly ShipOperatingRecord[] };
  snapshot(ship: ShipDefinition, hullMaxHp: number): ShipOperatingSnapshot;
  hasFuelForRoute(
    ship: ShipDefinition,
    distance: number,
    pilotingMultiplier?: number,
    engineeringMultiplier?: number
  ): boolean;
  burn(ship: ShipDefinition, distance: number, pilotingMultiplier?: number,
    engineeringMultiplier?: number): number;
  refuel(ship: ShipDefinition): FuelQuote;
  repair(ship: ShipDefinition, hullMaxHp: number, shipyard: boolean,
    engineeringMultiplier?: number): RepairQuote;
  repairEstimate(ship: ShipDefinition, hullMaxHp: number, shipyard: boolean,
    engineeringMultiplier?: number): RepairQuote;
  recordHull(ship: ShipDefinition, hullHp: number, hullMaxHp: number): void;
}

export function createShipOperatingService(
  wallet: Pick<PlayerTradeService, 'player' | 'takeCredits'>
): ShipOperatingService {
  const hulls = new Map<string, HullState>();
  const ensure = (ship: ShipDefinition): HullState => {
    let state = hulls.get(ship.id);
    if (!state) {
      state = { fuel: getShipRoleProfile(ship.role).fuelCapacity, damage: 0 };
      hulls.set(ship.id, state);
    }
    return state;
  };
  const snapshot = (ship: ShipDefinition, hullMaxHp: number): ShipOperatingSnapshot => {
    const state = ensure(ship);
    const fuelCapacity = getShipRoleProfile(ship.role).fuelCapacity;
    return {
      fuel: Math.max(0, Math.min(state.fuel, fuelCapacity)),
      fuelCapacity,
      hullHp: Math.max(0, hullMaxHp - state.damage),
      hullMaxHp,
    };
  };
  const estimate = (
    ship: ShipDefinition,
    hullMaxHp: number,
    shipyard: boolean,
    engineeringMultiplier = 1
  ) => quoteRepair(
    snapshot(ship, hullMaxHp).hullHp,
    hullMaxHp,
    wallet.player.credits,
    shipyard,
    engineeringMultiplier
  );
  return {
    snapshotAll() {
      return {
        hulls: [...hulls].map(([shipId, state]) => ({
          shipId,
          fuel: state.fuel,
          damage: state.damage,
        })),
      };
    },
    snapshot,
    hasFuelForRoute(ship, distance, pilotingMultiplier = 1, engineeringMultiplier = 1) {
      const required = fuelForDistance(
        distance, getShipRoleProfile(ship.role).fuelUse, pilotingMultiplier, engineeringMultiplier
      );
      return ensure(ship).fuel + 1e-6 >= required * 1.02;
    },
    burn(ship, distance, pilotingMultiplier = 1, engineeringMultiplier = 1) {
      const state = ensure(ship);
      const amount = fuelForDistance(
        distance, getShipRoleProfile(ship.role).fuelUse, pilotingMultiplier, engineeringMultiplier
      );
      const burned = Math.min(state.fuel, amount);
      state.fuel = Math.max(0, state.fuel - burned);
      return burned;
    },
    refuel(ship) {
      const state = ensure(ship);
      const quote = quoteRefuel(state.fuel, getShipRoleProfile(ship.role).fuelCapacity,
        wallet.player.credits);
      if (quote.cost > 0 && wallet.takeCredits(quote.cost)) {
        state.fuel = Math.min(getShipRoleProfile(ship.role).fuelCapacity, state.fuel + quote.units);
        return quote;
      }
      return { units: 0, cost: 0 };
    },
    repair(ship, hullMaxHp, shipyard, engineeringMultiplier = 1) {
      const quote = estimate(ship, hullMaxHp, shipyard, engineeringMultiplier);
      if (quote.cost > 0 && wallet.takeCredits(quote.cost)) {
        const state = ensure(ship);
        state.damage = Math.max(0, state.damage - quote.points);
        return quote;
      }
      return { points: 0, cost: 0 };
    },
    repairEstimate: estimate,
    recordHull(ship, hullHp, hullMaxHp) {
      if (!Number.isFinite(hullHp) || !Number.isFinite(hullMaxHp) || hullMaxHp <= 0) return;
      ensure(ship).damage = Math.max(0, hullMaxHp - Math.min(hullMaxHp, Math.max(0, hullHp)));
    },
  };
}
