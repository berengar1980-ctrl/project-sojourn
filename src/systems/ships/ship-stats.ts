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
