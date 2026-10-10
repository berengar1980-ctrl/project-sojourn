import type { ShipDefinition } from '../../core/ship-types';
import {
  calculateShipEnergy,
  componentCargoBonus,
  getShipComponent,
  miningYieldMultiplier,
  type InstalledShipComponents,
} from './ship-component-service';
import { resolveShipGameplayStats } from './ship-stats';

const BASE_MINING_CYCLE_SECONDS = 0.42;
const BASELINE_MINING_LASERS = 3;

export interface ShipMiningSetup {
  readonly available: boolean;
  readonly laserCount: number;
  readonly yieldMultiplier: number;
  readonly cycleSeconds: number;
  readonly cargoCapacityTons: number;
  readonly reactorOutput: number;
  readonly continuousPowerUsed: number;
}

export function defaultInstalledShipComponents(ship: ShipDefinition): InstalledShipComponents {
  const stats = resolveShipGameplayStats(ship);
  const common: InstalledShipComponents = {
    reactor: ['reactor1'],
    engine: ['engine1'],
    shield: ['shield1'],
    hull: ['hull1'],
    sensor: ['sensor1'],
    cargo: ['cargo1'],
    weapon: Array.from({ length: stats.weaponSlots }, (_, index) => {
      const mount = ship.sprite.hardpoints.weaponMounts?.find((slot) => slot.slotIndex === index);
      return !mount?.allowedMounts || mount.allowedMounts.includes('turret') ? 'weapon1' : '';
    }),
    mine: [''],
    tractor: [ship.role === 'mining' || ship.role === 'salvage' ? 'tractor1' : ''],
  };

  if (ship.role === 'mining') return { ...common, mining: ['mining1'] };
  if (ship.role === 'salvage') return { ...common, salvage: ['salvage1'] };
  return common;
}

function compatibleMiningModuleIds(
  installed: InstalledShipComponents,
  maxTier: number
): readonly string[] {
  return (installed.mining ?? []).filter((id) => {
    const component = getShipComponent('mining', id);
    return component !== null && component.tier <= maxTier;
  });
}

export function resolveShipMiningSetup(
  ship: ShipDefinition,
  installed: InstalledShipComponents = defaultInstalledShipComponents(ship)
): ShipMiningSetup {
  const stats = resolveShipGameplayStats(ship);
  const miningIds = compatibleMiningModuleIds(installed, stats.maxComponentTier);
  const effectiveInstalled: InstalledShipComponents = { ...installed, mining: miningIds };
  const energy = calculateShipEnergy(effectiveInstalled);
  const laserCount = ship.sprite.hardpoints.miningLasers.length;
  const yieldMultiplier = miningYieldMultiplier(effectiveInstalled);
  const laserMultiplier = Math.max(1 / BASELINE_MINING_LASERS, laserCount / BASELINE_MINING_LASERS);
  const cycleSeconds = BASE_MINING_CYCLE_SECONDS / (yieldMultiplier * laserMultiplier);
  const hasMiningModule = miningIds.length > 0;
  const hasContinuousPower = energy.output > 0 && energy.baseFree >= 0;

  return {
    available: laserCount > 0 && hasMiningModule && hasContinuousPower,
    laserCount,
    yieldMultiplier,
    cycleSeconds,
    cargoCapacityTons: Math.max(0, stats.cargoCapacityTons + componentCargoBonus(installed)),
    reactorOutput: energy.output,
    continuousPowerUsed: energy.baseUsed,
  };
}
