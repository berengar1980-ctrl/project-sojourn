import type { EconomyResourceId, PlayerEconomyState } from '../../core/economy-types';

interface PhysicalResourceAllocator {
  allocatePhysicalResource(resourceId: EconomyResourceId, amount: number): number;
  getPhysicalStock?(resourceId: string, sourceId: string): number | undefined;
  withdrawPhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
}

interface PlayerCargoReceiver {
  readonly player: PlayerEconomyState;
  receiveCargo(
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string
  ): number;
}

function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function cargoUsed(player: PlayerEconomyState): number {
  const resources = Object.values(player.cargo).reduce((sum, lot) => sum + quantity(lot.qty), 0);
  return resources + quantity(player.reservedCargoTons ?? 0);
}

export interface SalvageEconomyService {
  recover(
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string,
    sourceId?: string
  ): number;
}

export function createSalvageEconomyService(
  allocator: PhysicalResourceAllocator,
  cargo: PlayerCargoReceiver
): SalvageEconomyService {
  return {
    recover(resourceId, requestedQuantity, cargoCapacityTons, originId, sourceId) {
      const requested = quantity(requestedQuantity);
      const free = Math.max(0, quantity(cargoCapacityTons) - cargoUsed(cargo.player));
      const wanted = Math.min(requested, free);
      if (wanted <= 0) return 0;

      const stock = sourceId ? allocator.getPhysicalStock?.(resourceId, sourceId) : undefined;
      if (sourceId && stock !== undefined && allocator.withdrawPhysicalStock) {
        const received = cargo.receiveCargo(
          resourceId,
          Math.min(wanted, stock),
          cargoCapacityTons,
          originId
        );
        allocator.withdrawPhysicalStock(resourceId, sourceId, received);
        return received;
      }
      const allocated = allocator.allocatePhysicalResource(resourceId, wanted);
      if (allocated <= 0) return 0;
      return cargo.receiveCargo(resourceId, allocated, cargoCapacityTons, originId);
    },
  };
}
