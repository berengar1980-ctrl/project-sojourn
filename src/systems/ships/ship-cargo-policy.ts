import type { EconomyResourceId, PlayerEconomyState } from '../../core/economy-types';
import type { ShipDefinition, ShipSpecialCargoKind } from '../../core/ship-types';
import { economyResourceById } from '../../data/economy/economy-resources';
import { componentCargoBonus, type InstalledShipComponents } from './ship-component-service';
import { defaultInstalledShipComponents } from './ship-default-loadout';
import { resolveShipGameplayStats } from './ship-stats';

export interface ShipCargoPolicy {
  readonly totalCapacityTons: number;
  readonly generalCapacityTons: number;
  readonly reservedSpecialCargoTons: number;
  readonly specialCargoKind: ShipSpecialCargoKind | null;
}

function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function resolveShipCargoPolicy(
  ship: ShipDefinition,
  installed: InstalledShipComponents = defaultInstalledShipComponents(ship)
): ShipCargoPolicy {
  const stats = resolveShipGameplayStats(ship);
  const totalCapacityTons = Math.max(
    0,
    Math.floor(stats.cargoCapacityTons + componentCargoBonus(installed))
  );
  const reservedSpecialCargoTons = Math.min(
    totalCapacityTons,
    Math.max(0, Math.floor(stats.specialCargo?.capacityTons ?? 0))
  );

  return {
    totalCapacityTons,
    generalCapacityTons: totalCapacityTons - reservedSpecialCargoTons,
    reservedSpecialCargoTons,
    specialCargoKind: stats.specialCargo?.kind ?? null,
  };
}

function isMiningCargo(resourceId: EconomyResourceId): boolean {
  return economyResourceById(resourceId)?.categoryId === 'raw';
}

function totalCargoUsed(player: PlayerEconomyState): number {
  return Object.values(player.cargo).reduce((sum, lot) => sum + quantity(lot.qty), 0);
}

function specialCargoUsed(player: PlayerEconomyState, policy: ShipCargoPolicy): number {
  if (policy.specialCargoKind !== 'mining') return 0;
  const miningCargo = Object.entries(player.cargo).reduce(
    (sum, [resourceId, lot]) => sum + (isMiningCargo(resourceId) ? quantity(lot.qty) : 0),
    0
  );
  return Math.min(policy.reservedSpecialCargoTons, miningCargo);
}

export function shipTradeCargoLimit(
  ship: ShipDefinition,
  player: PlayerEconomyState,
  resourceId: EconomyResourceId,
  installed: InstalledShipComponents = defaultInstalledShipComponents(ship)
): number {
  const policy = resolveShipCargoPolicy(ship, installed);
  const used = totalCargoUsed(player);

  if (policy.specialCargoKind === 'mining' && isMiningCargo(resourceId)) {
    return policy.totalCapacityTons;
  }

  const reservedUsed = specialCargoUsed(player, policy);
  const generalUsed = Math.max(0, used - reservedUsed);
  const generalFree = Math.max(0, policy.generalCapacityTons - generalUsed);
  return Math.min(policy.totalCapacityTons, used + generalFree);
}
