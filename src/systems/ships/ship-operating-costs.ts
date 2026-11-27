import { quoteRefuel, type FuelQuote } from '../../core/fuel-pricing';
export { FUEL_PRICE_PER_UNIT, quoteRefuel, type FuelQuote } from '../../core/fuel-pricing';
import type { ShipDefinition } from '../../core/ship-types';
import { getShipRoleProfile } from '../../data/ships/ship-role-profiles';
import type { PlayerTradeService } from '../economy/player-trade-service';
import { FUEL_DISTANCE_SCALE } from '../npcs/npc-sector-routing';
import { getShipDefinition } from './ship-registry';

export const REPAIR_PRICE_PER_HULL_HP = 100;
export const EMERGENCY_FUEL_PRICE_PER_UNIT = 30;
export const EMERGENCY_FUEL_CALL_OUT = 500;
export const SHIPYARD_REPAIR_MULTIPLIER = 0.8;

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
  const base = distance * shipFuelUse * FUEL_DISTANCE_SCALE;
  return base * pilotingFuelMultiplier * engineeringFuelMultiplier;
}

/** Remote tanker service: pay a call-out fee and triple the normal fuel price. */
export function quoteEmergencyRefuel(fuel: number, capacity: number, credits: number): FuelQuote {
  const missing = Math.max(0, capacity - fuel);
  const budget = Math.max(0, Math.floor(credits) - EMERGENCY_FUEL_CALL_OUT);
  const units = Math.min(missing, Math.floor(budget / 3) / 10);
  if (units <= 0) return { units: 0, cost: 0 };
  return {
    units,
    cost: EMERGENCY_FUEL_CALL_OUT + Math.ceil(units * EMERGENCY_FUEL_PRICE_PER_UNIT - 1e-8),
  };
}

export function repairCost(points: number, shipyard: boolean, engineeringMultiplier = 1): number {
  if (points <= 0 || !Number.isFinite(points)) return 0;
  const engineering = Math.max(0, Math.min(1, engineeringMultiplier));
  const yardMultiplier = shipyard ? SHIPYARD_REPAIR_MULTIPLIER : 1;
  const cost = points * REPAIR_PRICE_PER_HULL_HP * yardMultiplier;
  return Math.ceil(cost * engineering);
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
  burn(
    ship: ShipDefinition,
    distance: number,
    pilotingMultiplier?: number,
    engineeringMultiplier?: number
  ): number;
  refuel(ship: ShipDefinition): FuelQuote;
  emergencyRefuel(ship: ShipDefinition): FuelQuote;
  repair(
    ship: ShipDefinition,
    hullMaxHp: number,
    shipyard: boolean,
    engineeringMultiplier?: number
  ): RepairQuote;
  repairEstimate(
    ship: ShipDefinition,
    hullMaxHp: number,
    shipyard: boolean,
    engineeringMultiplier?: number
  ): RepairQuote;
  recordHull(ship: ShipDefinition, hullHp: number, hullMaxHp: number): void;
}

export function createShipOperatingService(
  wallet: Pick<PlayerTradeService, 'player' | 'takeCredits'>,
  restoredHulls: readonly ShipOperatingRecord[] = []
): ShipOperatingService {
  const hulls = new Map<string, HullState>(
    restoredHulls.map((record) => [record.shipId, { fuel: record.fuel, damage: record.damage }])
  );
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
  function estimate(
    ship: ShipDefinition,
    hullMaxHp: number,
    shipyard: boolean,
    engineeringMultiplier = 1
  ): RepairQuote {
    const hull = snapshot(ship, hullMaxHp);
    const credits = wallet.player.credits;
    return quoteRepair(hull.hullHp, hullMaxHp, credits, shipyard, engineeringMultiplier);
  }
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
      const use = getShipRoleProfile(ship.role).fuelUse;
      const required = fuelForDistance(distance, use, pilotingMultiplier, engineeringMultiplier);
      return ensure(ship).fuel + 1e-6 >= required * 1.02;
    },
    burn(ship, distance, pilotingMultiplier = 1, engineeringMultiplier = 1) {
      const state = ensure(ship);
      const use = getShipRoleProfile(ship.role).fuelUse;
      const amount = fuelForDistance(distance, use, pilotingMultiplier, engineeringMultiplier);
      const burned = Math.min(state.fuel, amount);
      state.fuel = Math.max(0, state.fuel - burned);
      return burned;
    },
    refuel(ship) {
      const state = ensure(ship);
      const capacity = getShipRoleProfile(ship.role).fuelCapacity;
      const quote = quoteRefuel(state.fuel, capacity, wallet.player.credits);
      if (quote.cost > 0 && wallet.takeCredits(quote.cost)) {
        state.fuel = Math.min(capacity, state.fuel + quote.units);
        return quote;
      }
      return { units: 0, cost: 0 };
    },
    emergencyRefuel(ship) {
      const state = ensure(ship);
      const capacity = getShipRoleProfile(ship.role).fuelCapacity;
      const quote = quoteEmergencyRefuel(state.fuel, capacity, wallet.player.credits);
      if (quote.cost > 0 && wallet.takeCredits(quote.cost)) {
        state.fuel = Math.min(capacity, state.fuel + quote.units);
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

/** Validate a complete operating-state checkpoint before creating a new hull authority. */
export function stageCareerShipOperating(
  records: readonly ShipOperatingRecord[],
  wallet: Pick<PlayerTradeService, 'player' | 'takeCredits'>,
  ownedShipIds: readonly string[]
): ShipOperatingService {
  if (!Array.isArray(records)) throw new Error('Invalid ship operating checkpoint');
  const owned = new Set(ownedShipIds);
  const seen = new Set<string>();
  for (const record of records) {
    if (!record || typeof record.shipId !== 'string' || seen.has(record.shipId)) {
      throw new Error('Invalid ship operating record');
    }
    const ship = getShipDefinition(record.shipId);
    if (!ship || !owned.has(record.shipId)) throw new Error('Unknown or unowned ship');
    const capacity = getShipRoleProfile(ship.role).fuelCapacity;
    if (
      typeof record.fuel !== 'number' ||
      !Number.isFinite(record.fuel) ||
      record.fuel < 0 ||
      record.fuel > capacity ||
      typeof record.damage !== 'number' ||
      !Number.isFinite(record.damage) ||
      record.damage < 0
    ) {
      throw new Error('Invalid ship fuel or damage');
    }
    seen.add(record.shipId);
  }
  const restored = records.map((record) => ({ ...record }));
  return createShipOperatingService(wallet, restored);
}
