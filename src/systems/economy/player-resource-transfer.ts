import type { EconomyResourceId, PlayerEconomyState } from '../../core/economy-types';
import { wholeQuantity } from '../../core/economy-quantity';
import { playerCargoFree } from '../../core/player-cargo';

export interface PlayerCargoReceiver {
  readonly player: PlayerEconomyState;
  receiveCargo(
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string
  ): number;
}

export interface PhysicalStockAccess {
  getPhysicalStock?(resourceId: string, sourceId: string): number | undefined;
  withdrawPhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
  returnAllocatedResource?(resourceId: EconomyResourceId, amount: number): void;
}

interface ResourceTransfer {
  readonly resourceId: EconomyResourceId;
  readonly requestedQuantity: number;
  readonly cargoCapacityTons: number;
  readonly originId: string | undefined;
  readonly sourceId: string | undefined;
  readonly requireKnownStock: boolean;
  allocate(amount: number): number;
  onReceived?(amount: number): void;
}

/** Bound allocation by the same hold rule used by the receiving trade service. */
export function transferPlayerResource(
  cargo: PlayerCargoReceiver,
  allocator: PhysicalStockAccess,
  transfer: ResourceTransfer
): number {
  const { resourceId, cargoCapacityTons, originId, sourceId } = transfer;
  const wanted = Math.min(
    wholeQuantity(transfer.requestedQuantity),
    playerCargoFree(cargo.player, cargoCapacityTons)
  );
  if (wanted <= 0) return 0;

  const stock = sourceId ? allocator.getPhysicalStock?.(resourceId, sourceId) : undefined;
  if (sourceId && allocator.withdrawPhysicalStock) {
    if (stock !== undefined) {
      const received = cargo.receiveCargo(
        resourceId,
        Math.min(wanted, stock),
        cargoCapacityTons,
        originId
      );
      allocator.withdrawPhysicalStock(resourceId, sourceId, received);
      transfer.onReceived?.(received);
      return received;
    }
    if (transfer.requireKnownStock && allocator.getPhysicalStock) return 0;
  }

  const allocated = transfer.allocate(wanted);
  if (allocated <= 0) return 0;
  const received = cargo.receiveCargo(resourceId, allocated, cargoCapacityTons, originId);
  if (received < allocated) allocator.returnAllocatedResource?.(resourceId, allocated - received);
  transfer.onReceived?.(received);
  return received;
}
