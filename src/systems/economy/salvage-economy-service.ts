import { wholeQuantity as quantity } from '../../core/economy-quantity';
import type { EconomyResourceId, PlayerEconomyState } from '../../core/economy-types';
import type { SalvageField, SalvageWreck, SalvageEventResolution } from '../../core/salvage-types';
import { salvageStockId } from '../salvage/salvage-stock-id';

interface PhysicalResourceAllocator {
  allocatePhysicalResource(resourceId: EconomyResourceId, amount: number): number;
  fundPhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
  getPhysicalStock?(resourceId: string, sourceId: string): number | undefined;
  withdrawPhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
  losePhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
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

function cargoUsed(player: PlayerEconomyState): number {
  const resources = Object.values(player.cargo).reduce((sum, lot) => sum + quantity(lot.qty), 0);
  return resources + quantity(player.reservedCargoTons ?? 0);
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
      const requested = quantity(requestedQuantity);
      const free = Math.max(0, quantity(cargoCapacityTons) - cargoUsed(cargo.player));
      const wanted = Math.min(requested, free);
      if (wanted <= 0) return 0;

      const stock = sourceId ? allocator.getPhysicalStock?.(resourceId, sourceId) : undefined;
      if (sourceId && allocator.getPhysicalStock && allocator.withdrawPhysicalStock) {
        if (stock === undefined) return 0;
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
