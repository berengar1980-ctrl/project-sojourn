import type {
  SalvageComponentRecoveryResult,
  SalvageField,
  SalvageRecoveryResult,
  SalvageWreck,
} from '../../core/salvage-types';
import type { ShipComponentType } from '../../core/ship-types';
import { salvageYieldMultiplier } from '../crew/crew-skill-effects';
import type { ShipSalvageSetup } from '../ships/ship-salvage-capability';

export interface SalvageResourceCollector {
  (
    resourceId: string,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string
  ): number;
}

export interface SalvageComponentCollector {
  (
    type: ShipComponentType,
    componentId: string,
    sourceWreckId: string,
    cargoCapacityTons: number
  ): boolean;
}

export interface SalvageFieldService {
  readonly field: SalvageField;
  inspectWreck(wreckId: string): SalvageWreck | null;
  componentChance(wreckId: string): number | null;
  recoverComponent(wreckId: string): SalvageComponentRecoveryResult | null;
  recoverResource(wreckId: string, resourceId?: string): SalvageRecoveryResult | null;
}

function deterministicComponentRoll(field: SalvageField, wreck: SalvageWreck): number {
  const source = field.seed + ':' + wreck.id + ':' + (wreck.component?.componentId ?? '');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function salvageComponentRecoveryChance(
  setup: ShipSalvageSetup,
  crewSkill: number,
  difficulty: number
): number {
  return Math.max(
    12,
    Math.min(95, Math.round(50 + crewSkill * 0.45 + setup.chanceBonus - difficulty * 0.3))
  );
}

export function createSalvageFieldService(options: {
  readonly field: SalvageField;
  readonly setup: ShipSalvageSetup;
  readonly crewSkill: number;
  readonly collect: SalvageResourceCollector;
  readonly collectComponent?: SalvageComponentCollector;
}): SalvageFieldService {
  const { field, setup, crewSkill, collect, collectComponent } = options;

  const findWreck = (wreckId: string): SalvageWreck | null =>
    field.wrecks.find((wreck) => wreck.id === wreckId) ?? null;

  return {
    field,

    inspectWreck(wreckId) {
      const wreck = findWreck(wreckId);
      if (!wreck) return null;
      wreck.inspected = true;
      wreck.scanLevel = 'analyzed';
      return wreck;
    },

    componentChance(wreckId) {
      const wreck = findWreck(wreckId);
      if (!wreck?.component || wreck.componentStatus !== 'available') return null;
      return salvageComponentRecoveryChance(setup, crewSkill, wreck.component.recoveryDifficulty);
    },

    recoverComponent(wreckId) {
      if (!setup.available) return null;
      const wreck = findWreck(wreckId);
      if (!wreck?.inspected || !wreck.component || wreck.componentStatus !== 'available') {
        return null;
      }

      const chancePercent = salvageComponentRecoveryChance(
        setup,
        crewSkill,
        wreck.component.recoveryDifficulty
      );
      if (deterministicComponentRoll(field, wreck) * 100 >= chancePercent) {
        wreck.componentStatus = 'destroyed';
        return {
          wreckId,
          componentId: wreck.component.componentId,
          outcome: 'destroyed',
          chancePercent,
        };
      }

      const stored =
        collectComponent?.(
          wreck.component.type,
          wreck.component.componentId,
          wreck.id,
          setup.cargoCapacityTons
        ) ?? false;
      if (!stored) {
        return {
          wreckId,
          componentId: wreck.component.componentId,
          outcome: 'no_space',
          chancePercent,
        };
      }

      wreck.componentStatus = 'recovered';
      return {
        wreckId,
        componentId: wreck.component.componentId,
        outcome: 'recovered',
        chancePercent,
      };
    },

    recoverResource(wreckId, resourceId) {
      if (!setup.available) return null;
      const wreck = findWreck(wreckId);
      if (!wreck?.inspected) return null;

      const deposit =
        wreck.resources.find(
          (entry) =>
            entry.remainingAmount > 0 &&
            (resourceId === undefined || entry.resourceId === resourceId)
        ) ?? null;
      if (!deposit) return null;

      const crewMultiplier = salvageYieldMultiplier(crewSkill);
      const baseAmount = 3 + wreck.quality * 2;
      const wanted = Math.max(1, Math.round(baseAmount * setup.yieldMultiplier * crewMultiplier));
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
