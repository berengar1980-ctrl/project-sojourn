import type {
  SalvageField,
  SalvageRecoveryResult,
  SalvageWreck,
} from '../../core/salvage-types';
import type { ShipSalvageSetup } from '../ships/ship-salvage-capability';
import { stationFactor } from '../ships/station-performance';

export interface SalvageResourceCollector {
  (
    resourceId: string,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string
  ): number;
}

export interface SalvageFieldService {
  readonly field: SalvageField;
  inspectWreck(wreckId: string): SalvageWreck | null;
  recoverResource(wreckId: string, resourceId?: string): SalvageRecoveryResult | null;
}

export function createSalvageFieldService(options: {
  readonly field: SalvageField;
  readonly setup: ShipSalvageSetup;
  readonly crewSkill: number;
  readonly collect: SalvageResourceCollector;
}): SalvageFieldService {
  const { field, setup, crewSkill, collect } = options;

  const findWreck = (wreckId: string): SalvageWreck | null =>
    field.wrecks.find((wreck) => wreck.id === wreckId) ?? null;

  return {
    field,

    inspectWreck(wreckId) {
      const wreck = findWreck(wreckId);
      if (!wreck) return null;
      wreck.inspected = true;
      return wreck;
    },

    recoverResource(wreckId, resourceId) {
      if (!setup.available) return null;
      const wreck = findWreck(wreckId);
      if (!wreck?.inspected) return null;

      const deposit =
        wreck.resources.find(
          (entry) =>
            entry.remainingAmount > 0 && (resourceId === undefined || entry.resourceId === resourceId)
        ) ?? null;
      if (!deposit) return null;

      const crewMultiplier = stationFactor(crewSkill, 0.35);
      const baseAmount = 3 + wreck.quality * 2;
      const wanted = Math.max(
        1,
        Math.round(baseAmount * setup.yieldMultiplier * crewMultiplier)
      );
      const recovered = collect(
        deposit.resourceId,
        Math.min(wanted, deposit.remainingAmount),
        setup.cargoCapacityTons,
        field.sourceLocationId
      );
      if (recovered <= 0) return null;

      deposit.remainingAmount = Math.max(0, deposit.remainingAmount - recovered);
      const depleted = wreck.resources.every((entry) => entry.remainingAmount <= 0);
      return {
        wreckId: wreck.id,
        resourceId: deposit.resourceId,
        recovered,
        remaining: deposit.remainingAmount,
        depleted,
      };
    },
  };
}
