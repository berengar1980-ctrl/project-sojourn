import type { ShipDefinition } from '../../core/ship-types';
import {
  calculateShipEnergy,
  componentCargoBonus,
  getShipComponent,
  miningYieldMultiplier,
  type InstalledShipComponents,
} from './ship-component-service';
import { resolveShipGameplayStats } from './ship-stats';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';

/** Starter armament must respect the actual hardpoint mount and family.
 * Previous defaults equipped only turret pulse lasers: bow/broadside slots
 * received empty strings and campaign ships silently entered combat unarmed.
 */
export function defaultStarterWeaponId(
  ship: ShipDefinition,
  slotIndex: number
): string {
  const hardpoint = ship.sprite.hardpoints.weaponMounts?.find((slot) => slot.slotIndex === slotIndex);
  if (!hardpoint && ship.sprite.hardpoints.weaponMounts?.length) return '';
  const weapons = (SHIP_COMPONENT_CATALOG.weapon ?? [])
    .filter((component) =>
      component.tier === 1 &&
      component.weapon &&
      (!hardpoint?.allowedMounts ||
        hardpoint.allowedMounts.includes(component.weapon.mount ?? 'turret')) &&
      (!hardpoint?.allowedFamilies ||
        hardpoint.allowedFamilies.includes(component.weapon.family))
    );
  const preferred = weapons.find((component) => component.weapon?.family === 'pulse_laser')
    ?? weapons.find((component) => component.weapon?.family === 'railgun')
    ?? weapons.find((component) => component.weapon?.family === 'plasma_battery')
    ?? weapons.find((component) => component.weapon?.family === 'autocannon')
    ?? weapons.find((component) => component.weapon?.ammoPerShot === 0)
    ?? weapons[0];
  return preferred?.id ?? '';
}

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
  const compatibleStarters = Array.from({ length: stats.weaponSlots }, (_, index) =>
    defaultStarterWeaponId(ship, index)
  );
  // Prefer an actual defensive pulse laser turret: it can track a pirate
  // throughout the engagement rather than chasing a 60-degree railgun arc.
  const turretSlot = compatibleStarters.indexOf('weapon1');
  const starterSlot = turretSlot >= 0
    ? turretSlot
    : compatibleStarters.findIndex((id) => id !== '');
  const common: InstalledShipComponents = {
    reactor: ['reactor1'],
    engine: ['engine1'],
    shield: ['shield1'],
    hull: ['hull1'],
    sensor: ['sensor1'],
    cargo: ['cargo1'],
    // One affordable defensive Mk I gun as the campaign baseline. Remaining
    // slots stay free for upgrades, not silently filled with incompatible gear.
    weapon: Array.from({ length: stats.weaponSlots }, (_, index) =>
      index === starterSlot ? compatibleStarters[index]! : ''
    ),
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
