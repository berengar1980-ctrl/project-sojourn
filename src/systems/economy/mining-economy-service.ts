import type { EconomyResourceId, PlayerEconomyState } from '../../core/economy-types';

interface PhysicalResourceAllocator {
  createMinedResource(resourceId: EconomyResourceId, amount: number): number;
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

function finiteInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function cargoUsed(player: PlayerEconomyState): number {
  return Object.values(player.cargo).reduce((sum, lot) => sum + finiteInteger(lot.qty), 0);
}

export interface MiningEconomyService {
  collect(
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string,
    sourceId?: string
  ): number;
}

export function createMiningEconomyService(
  allocator: PhysicalResourceAllocator,
  cargo: PlayerCargoReceiver,
  options: {
    allowance?: (id: string, amount: number, origin?: string) => number;
    onCollected?: (id: string, amount: number, origin?: string) => void;
  } = {}
): MiningEconomyService {
  return {
    collect(resourceId, requestedQuantity, cargoCapacityTons, originId, sourceId) {
      const requested = finiteInteger(requestedQuantity);
      const free = Math.max(0, finiteInteger(cargoCapacityTons) - cargoUsed(cargo.player));
      const wanted = Math.min(
        requested,
        free,
        options.allowance?.(resourceId, requested, originId) ?? requested
      );
      if (wanted <= 0) return 0;

      const stock = sourceId ? allocator.getPhysicalStock?.(resourceId, sourceId) : undefined;
      if (sourceId && stock !== undefined && allocator.withdrawPhysicalStock) {
        const collected = cargo.receiveCargo(
          resourceId,
          Math.min(wanted, stock),
          cargoCapacityTons,
          originId
        );
        allocator.withdrawPhysicalStock(resourceId, sourceId, collected);
        options.onCollected?.(resourceId, collected, originId);
        return collected;
      }
      const allocated = allocator.createMinedResource(resourceId, wanted);
      if (allocated <= 0) return 0;

      const collected = cargo.receiveCargo(resourceId, allocated, cargoCapacityTons, originId);
      options.onCollected?.(resourceId, collected, originId);
      return collected;
    },
  };
}
