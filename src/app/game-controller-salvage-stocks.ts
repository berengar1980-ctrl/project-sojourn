import type { SalvageField } from '../core/salvage-types';
import type { EconomySimulationService } from '../systems/economy/economy-simulation-service';
import { salvageStockId } from '../systems/salvage/salvage-stock-id';

export function registerPermanentSalvageStocks(
  simulation: EconomySimulationService,
  field: SalvageField
): void {
  for (const wreck of field.wrecks) {
    if (wreck.combatWreckVariant) continue;
    const sourceId = salvageStockId(field, wreck);
    for (const deposit of wreck.resources) {
      const { resourceId, remainingAmount } = deposit;
      simulation.registerInitialPhysicalStock(resourceId, sourceId, remainingAmount);
    }
  }
}

export function balancePermanentSalvageStocks(
  simulation: EconomySimulationService,
  field: SalvageField,
  canRefill: (wreckId: string) => boolean
): void {
  for (const wreck of field.wrecks) {
    if (wreck.combatWreckVariant) continue;
    const sourceId = salvageStockId(field, wreck);
    for (const deposit of wreck.resources) {
      const stock = simulation.getPhysicalStock(deposit.resourceId, sourceId);
      if (stock === undefined) continue;
      if (stock > deposit.remainingAmount) {
        const loss = stock - deposit.remainingAmount;
        simulation.losePhysicalStock(deposit.resourceId, sourceId, loss);
      }
      if (stock < deposit.remainingAmount) deposit.remainingAmount = stock;
      if (!canRefill(wreck.id)) continue;
      const deficit = deposit.initialAmount - deposit.remainingAmount;
      const funded = simulation.fundPhysicalStock(deposit.resourceId, sourceId, deficit);
      deposit.remainingAmount += funded;
    }
  }
}
