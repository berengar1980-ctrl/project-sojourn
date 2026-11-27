import {
  transferPlayerResource,
  type PhysicalStockAccess,
  type PlayerCargoReceiver,
} from './player-resource-transfer';
import { wholeQuantity as finiteInteger } from '../../core/economy-quantity';
import type { EconomyResourceId } from '../../core/economy-types';

interface PhysicalResourceAllocator extends PhysicalStockAccess {
  createMinedResource(resourceId: EconomyResourceId, amount: number): number;
  fundPhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
}

export interface MiningEconomyService {
  fundDiscoveredOre?(resourceId: string, sourceId: string, amount: number): number;
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
    fundDiscoveredOre(resourceId, sourceId, amount) {
      return allocator.fundPhysicalStock?.(resourceId, sourceId, amount) ?? 0;
    },
    collect(resourceId, requestedQuantity, cargoCapacityTons, originId, sourceId) {
      const requested = finiteInteger(requestedQuantity);
      return transferPlayerResource(cargo, allocator, {
        resourceId,
        requestedQuantity: Math.min(
          requested,
          options.allowance?.(resourceId, requested, originId) ?? requested
        ),
        cargoCapacityTons,
        originId,
        sourceId,
        requireKnownStock: false,
        allocate: (amount) => allocator.createMinedResource(resourceId, amount),
        onReceived: (amount) => options.onCollected?.(resourceId, amount, originId),
      });
    },
  };
}
