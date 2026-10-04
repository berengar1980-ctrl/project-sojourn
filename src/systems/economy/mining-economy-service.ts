import type { EconomyResourceId, PlayerEconomyState } from '../../core/economy-types';

interface PhysicalResourceAllocator {
  createMinedResource(resourceId: EconomyResourceId, amount: number): number;
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
    originId?: string
  ): number;
}

export function createMiningEconomyService(
  allocator: PhysicalResourceAllocator,
  cargo: PlayerCargoReceiver
): MiningEconomyService {
  return {
    collect(resourceId, requestedQuantity, cargoCapacityTons, originId) {
      const requested = finiteInteger(requestedQuantity);
      const free = Math.max(0, finiteInteger(cargoCapacityTons) - cargoUsed(cargo.player));
      const wanted = Math.min(requested, free);
      if (wanted <= 0) return 0;

      const allocated = allocator.createMinedResource(resourceId, wanted);
      if (allocated <= 0) return 0;

      return cargo.receiveCargo(resourceId, allocated, cargoCapacityTons, originId);
    },
  };
}
