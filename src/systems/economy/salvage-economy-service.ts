import {
  transferPlayerResource,
  type PhysicalStockAccess,
  type PlayerCargoReceiver,
} from './player-resource-transfer';
import type { EconomyResourceId } from '../../core/economy-types';
import type { SalvageField, SalvageWreck, SalvageEventResolution } from '../../core/salvage-types';
import { salvageStockId } from '../salvage/salvage-stock-id';

interface PhysicalResourceAllocator extends PhysicalStockAccess {
  allocatePhysicalResource(resourceId: EconomyResourceId, amount: number): number;
  fundPhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
  losePhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
}

export interface SalvageEconomyService {
  prepareEventField?(field: SalvageField): void;
  reconcileWreckEvent?(
    field: SalvageField,
    wreck: SalvageWreck,
    result: SalvageEventResolution
  ): SalvageEventResolution;
  recover(
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string,
    sourceId?: string
  ): number;
}

/** Event discoveries draw from existing reserves; destruction is recorded immediately. */
export function reconcileSalvageEventStock(
  allocator: PhysicalResourceAllocator,
  field: SalvageField,
  wreck: SalvageWreck,
  result: SalvageEventResolution
): SalvageEventResolution {
  if (!allocator.getPhysicalStock || !allocator.fundPhysicalStock || !allocator.losePhysicalStock)
    return result;
  const source = salvageStockId(field, wreck);
  let unfunded = 0;
  for (const deposit of wreck.resources) {
    const stock = allocator.getPhysicalStock(deposit.resourceId, source) ?? 0;
    const difference = deposit.remainingAmount - stock;
    if (difference < 0) allocator.losePhysicalStock(deposit.resourceId, source, -difference);
    if (difference > 0) {
      const funded = allocator.fundPhysicalStock(deposit.resourceId, source, difference);
      const missing = difference - funded;
      deposit.remainingAmount -= missing;
      deposit.initialAmount = Math.max(deposit.remainingAmount, deposit.initialAmount - missing);
      unfunded += missing;
    }
  }
  if (!unfunded) return result;
  return {
    ...result,
    resourceAddedTons: Math.max(0, result.resourceAddedTons - unfunded),
    resultText: result.resultText + ' Davon ' + unfunded + ' t nicht bergbar.',
  };
}

export function createSalvageEconomyService(
  allocator: PhysicalResourceAllocator,
  cargo: PlayerCargoReceiver
): SalvageEconomyService {
  return {
    reconcileWreckEvent: (field, wreck, result) =>
      reconcileSalvageEventStock(allocator, field, wreck, result),
    prepareEventField(field) {
      if (!allocator.fundPhysicalStock || !allocator.getPhysicalStock) return;
      for (const wreck of field.wrecks) {
        if (wreck.combatWreckVariant) continue;
        const sourceId = salvageStockId(field, wreck);
        for (const deposit of wreck.resources) {
          const stock = allocator.getPhysicalStock(deposit.resourceId, sourceId);
          const requested = deposit.remainingAmount;
          const available =
            stock ?? allocator.fundPhysicalStock(deposit.resourceId, sourceId, requested);
          deposit.remainingAmount = Math.min(deposit.remainingAmount, available);
        }
      }
    },
    recover(resourceId, requestedQuantity, cargoCapacityTons, originId, sourceId) {
      return transferPlayerResource(cargo, allocator, {
        resourceId,
        requestedQuantity,
        cargoCapacityTons,
        originId,
        sourceId,
        requireKnownStock: true,
        allocate: (amount) => allocator.allocatePhysicalResource(resourceId, amount),
      });
    },
  };
}
