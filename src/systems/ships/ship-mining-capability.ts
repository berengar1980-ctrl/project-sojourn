import type { ShipDefinition } from '../../core/ship-types';
import {
  calculateShipEnergy,
  componentCargoBonus,
  getShipComponent,
  miningYieldMultiplier,
  type InstalledShipComponents,
} from './ship-component-service';
import { defaultInstalledShipComponents } from './ship-default-loadout';
import { resolveShipGameplayStats } from './ship-stats';
import { stationFactor } from './station-performance';

export { defaultInstalledShipComponents };

const BASE_MINING_CYCLE_SECONDS = 0.42;
const BASELINE_MINING_LASERS = 3;
const AUTOMATION_SKILL = 20;

export interface ShipMiningSetup {
  readonly available: boolean;
  readonly laserCount: number;
  readonly yieldMultiplier: number;
  readonly crewMultiplier: number;
  readonly cycleSeconds: number;
  readonly cargoCapacityTons: number;
  readonly reactorOutput: number;
  readonly continuousPowerUsed: number;
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

function miningCrewMultiplier(skill: number): number {
  const baseline = stationFactor(AUTOMATION_SKILL, 0.25);
  return stationFactor(skill, 0.25) / baseline;
}

export function resolveShipMiningSetup(
  ship: ShipDefinition,
  installed: InstalledShipComponents = defaultInstalledShipComponents(ship),
  crewSkill = AUTOMATION_SKILL
): ShipMiningSetup {
  const stats = resolveShipGameplayStats(ship);
  const miningIds = compatibleMiningModuleIds(installed, stats.maxComponentTier);
  const effectiveInstalled: InstalledShipComponents = { ...installed, mining: miningIds };
  const energy = calculateShipEnergy(effectiveInstalled);
  const laserCount = ship.sprite.hardpoints.miningLasers.length;
  const yieldMultiplier = miningYieldMultiplier(effectiveInstalled);
  const laserMultiplier = Math.max(1 / BASELINE_MINING_LASERS, laserCount / BASELINE_MINING_LASERS);
  const crewMultiplier = miningCrewMultiplier(crewSkill);
  const cycleSeconds =
    BASE_MINING_CYCLE_SECONDS / (yieldMultiplier * laserMultiplier * crewMultiplier);
  const hasMiningModule = miningIds.length > 0;
  const hasContinuousPower = energy.output > 0 && energy.baseFree >= 0;

  return {
    available: laserCount > 0 && hasMiningModule && hasContinuousPower,
    laserCount,
    yieldMultiplier,
    crewMultiplier,
    cycleSeconds,
    cargoCapacityTons: Math.max(0, stats.cargoCapacityTons + componentCargoBonus(installed)),
    reactorOutput: energy.output,
    continuousPowerUsed: energy.baseUsed,
  };
}
