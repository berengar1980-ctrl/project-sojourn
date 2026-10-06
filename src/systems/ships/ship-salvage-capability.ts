import type { ShipDefinition } from '../../core/ship-types';
import {
  calculateShipEnergy,
  componentCargoBonus,
  getShipComponent,
  salvageChanceBonus,
  salvageYieldMultiplier,
  type InstalledShipComponents,
} from './ship-component-service';
import { defaultInstalledShipComponents } from './ship-mining-capability';
import { resolveShipGameplayStats } from './ship-stats';

const BASE_SALVAGE_CYCLE_SECONDS = 4.8;

export interface ShipSalvageSetup {
  readonly available: boolean;
  readonly yieldMultiplier: number;
  readonly chanceBonus: number;
  readonly cycleSeconds: number;
  readonly cargoCapacityTons: number;
  readonly reactorOutput: number;
  readonly continuousPowerUsed: number;
}

function compatibleSalvageModuleIds(
  installed: InstalledShipComponents,
  maxTier: number
): readonly string[] {
  return (installed.salvage ?? []).filter((id) => {
    const component = getShipComponent('salvage', id);
    return component !== null && component.tier <= maxTier;
  });
}

export function resolveShipSalvageSetup(
  ship: ShipDefinition,
  installed: InstalledShipComponents = defaultInstalledShipComponents(ship)
): ShipSalvageSetup {
  const stats = resolveShipGameplayStats(ship);
  const salvageIds = compatibleSalvageModuleIds(installed, stats.maxComponentTier);
  const effectiveInstalled: InstalledShipComponents = { ...installed, salvage: salvageIds };
  const energy = calculateShipEnergy(effectiveInstalled);
  const yieldMultiplier = salvageYieldMultiplier(effectiveInstalled);
  const hasModule = salvageIds.length > 0;
  const hasPower = energy.output > 0 && energy.baseFree >= 0;

  return {
    available: ship.role === 'salvage' && hasModule && hasPower,
    yieldMultiplier,
    chanceBonus: salvageChanceBonus(effectiveInstalled),
    cycleSeconds: BASE_SALVAGE_CYCLE_SECONDS / Math.max(0.25, yieldMultiplier),
    cargoCapacityTons: Math.max(0, stats.cargoCapacityTons + componentCargoBonus(installed)),
    reactorOutput: energy.output,
    continuousPowerUsed: energy.baseUsed,
  };
}
