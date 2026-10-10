import type {
  ResolvedShipGameplayStats,
  ShipDefinition,
  ShipGameplayProfile,
} from '../../core/ship-types';
import { getShipRoleProfile } from '../../data/ships/ship-role-profiles';

export function resolveShipGameplayStats(ship: ShipDefinition): ResolvedShipGameplayStats {
  const role = getShipRoleProfile(ship.role);
  const overrides = ship.gameplayOverrides;

  return {
    ...role,
    ...overrides,
    stations: role.stations,
    specialCargo:
      overrides && 'specialCargo' in overrides
        ? (overrides.specialCargo ?? null)
        : role.specialCargo,
    cargoCapacityTons: ship.cargoCapacityTons,
    cruiseSpeed: ship.navigation.cruiseSpeed,
  };
}

/** Canonical combat movement values for either player or NPCs in the same hull. */
export function resolveShipCombatMovementStats(ship: ShipDefinition): {
  readonly combatSpeed: number;
  readonly turnRateRadiansPerSecond: number;
  readonly accelerationMetersPerSecond2: number;
} {
  const baseSpeed = Math.max(78, Math.min(160, ship.navigation.cruiseSpeed * 0.28));
  const patrolSpeedFactor = ship.role === 'patrol' ? 1.3 : 1;
  return {
    combatSpeed: Math.round(baseSpeed * patrolSpeedFactor),
    turnRateRadiansPerSecond: Math.max(
      0.4,
      Math.min(0.86, 1.02 - ship.nominalLengthMeters * 0.006)
    ),
    accelerationMetersPerSecond2: Math.max(20, Math.min(38, 46 - ship.nominalLengthMeters * 0.18)),
  };
}

export function shipShieldMaxHp(
  ship: ShipDefinition,
  baseShieldHp = ship.sprite.hardpoints.shield.maxHp
): number {
  const stats = resolveShipGameplayStats(ship);
  return Math.max(1, Math.round(baseShieldHp * stats.shieldModifier));
}

export function shipHullMaxHp(ship: ShipDefinition, hullBonus = 0): number {
  return Math.max(1, Math.round(resolveShipGameplayStats(ship).hullPoints + hullBonus));
}

export function shipRoleGameplayProfile(ship: ShipDefinition): ShipGameplayProfile {
  return getShipRoleProfile(ship.role);
}
