import type {
  ResolvedShipGameplayStats,
  ShipDefinition,
  ShipGameplayProfile,
} from '../../core/ship-types';
import { getShipRoleProfile } from '../../data/ships/ship-role-profiles';
import { engineSpeedMultiplier, type InstalledShipComponents } from './ship-component-service';
import { shipActiveCombatWeaponMounts } from './ship-combat-role-policy';

export function resolveShipGameplayStats(ship: ShipDefinition): ResolvedShipGameplayStats {
  const role = getShipRoleProfile(ship.role);
  const overrides = ship.gameplayOverrides;

  return {
    ...role,
    ...overrides,
    weaponSlots: ship.sprite.hardpoints.weaponMounts
      ? shipActiveCombatWeaponMounts(ship).length
      : role.weaponSlots,
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
export function resolveShipCombatMovementStats(
  ship: ShipDefinition,
  installed?: InstalledShipComponents
): {
  readonly combatSpeed: number;
  readonly turnRateRadiansPerSecond: number;
  readonly accelerationMetersPerSecond2: number;
} {
  const normalBaseSpeed = Math.max(78, Math.min(160, ship.navigation.cruiseSpeed * 0.28));
  const baseSpeed = ship.role === 'freighter' ? 69 : normalBaseSpeed;
  const patrolSpeedFactor = ship.role === 'patrol' ? 1.3 : 1;
  const drive = installed ? engineSpeedMultiplier(installed) : 1;
  return {
    combatSpeed: Math.round(baseSpeed * patrolSpeedFactor * drive),
    turnRateRadiansPerSecond: Math.max(
      0.4,
      Math.min(0.86, 1.02 - ship.nominalLengthMeters * 0.006)
    ),
    accelerationMetersPerSecond2:
      Math.max(20, Math.min(38, 46 - ship.nominalLengthMeters * 0.18)) *
      (1 + (drive - 1) * 0.5),
  };
}

/** Unboosted local travel uses the same hull speed as ordinary combat thrust. */
export function resolveShipLocalCruiseSpeed(
  ship: ShipDefinition,
  installed?: InstalledShipComponents
): number {
  return resolveShipCombatMovementStats(ship, installed).combatSpeed;
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
