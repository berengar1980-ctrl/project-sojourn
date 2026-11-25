import type { SalvageField, SalvageWreck } from '../../core/salvage-types';

export function salvageStockId(field: SalvageField, wreck: SalvageWreck): string {
  return wreck.combatWreckVariant ? wreck.id : JSON.stringify([field.id, wreck.id]);
}
