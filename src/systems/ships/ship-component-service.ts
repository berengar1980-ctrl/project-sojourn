import {
  SHIP_COMPONENT_CATALOG,
  type ShipComponentDefinition,
  type ShipComponentType,
} from '../../data/ships/ship-component-catalog';

export type InstalledShipComponents = Readonly<
  Partial<Record<ShipComponentType, readonly string[]>>
>;

export interface ShipEnergySnapshot {
  readonly output: number;
  readonly baseUsed: number;
  readonly baseFree: number;
  readonly shieldUsed: number;
  readonly weaponsUsed: number;
  readonly combatUsed: number;
  readonly combatFree: number;
}

export function getShipComponent(type: ShipComponentType, id: string): ShipComponentDefinition | null {
  return SHIP_COMPONENT_CATALOG[type]?.find((component) => component.id === id) ?? null;
}

export function getCompatibleShipComponents(
  type: ShipComponentType,
  maxTier: number
): readonly ShipComponentDefinition[] {
  return (SHIP_COMPONENT_CATALOG[type] ?? []).filter(
    (component) => component.tier <= Math.max(0, maxTier)
  );
}

function installedDefinitions(
  installed: InstalledShipComponents,
  type: ShipComponentType
): readonly ShipComponentDefinition[] {
  return (installed[type] ?? [])
    .map((id) => getShipComponent(type, id))
    .filter((component): component is ShipComponentDefinition => component !== null);
}

export function calculateShipEnergy(installed: InstalledShipComponents): ShipEnergySnapshot {
  const reactor = installedDefinitions(installed, 'reactor')[0];
  const output = Number(reactor?.output ?? 0);
  let baseUsed = 0;
  let shieldUsed = 0;
  let weaponsUsed = 0;

  for (const type of Object.keys(installed) as ShipComponentType[]) {
    if (type === 'reactor') continue;
    for (const component of installedDefinitions(installed, type)) {
      const power = Number(component.power ?? 0);
      if (type === 'shield') shieldUsed += power;
      else if (type === 'weapon') weaponsUsed += power;
      else baseUsed += power;
    }
  }

  const combatUsed = baseUsed + shieldUsed + weaponsUsed;
  return {
    output,
    baseUsed,
    baseFree: output - baseUsed,
    shieldUsed,
    weaponsUsed,
    combatUsed,
    combatFree: output - combatUsed,
  };
}

function sumField(
  installed: InstalledShipComponents,
  type: ShipComponentType,
  field: 'bonus' | 'speed' | 'range'
): number {
  return installedDefinitions(installed, type).reduce(
    (sum, component) => sum + Number(component[field] ?? 0),
    0
  );
}

function bestField(
  installed: InstalledShipComponents,
  type: ShipComponentType,
  field: 'yield' | 'chance'
): number {
  return installedDefinitions(installed, type).reduce(
    (best, component) => Math.max(best, Number(component[field] ?? 0)),
    0
  );
}

export function componentHullBonus(installed: InstalledShipComponents): number {
  return sumField(installed, 'hull', 'bonus');
}

export function componentShieldBonus(installed: InstalledShipComponents): number {
  return sumField(installed, 'shield', 'bonus');
}

export function componentCargoBonus(installed: InstalledShipComponents): number {
  return sumField(installed, 'cargo', 'bonus');
}

export function engineSpeedMultiplier(installed: InstalledShipComponents): number {
  return 1 + sumField(installed, 'engine', 'speed');
}

export function sensorRangeMultiplier(installed: InstalledShipComponents): number {
  return 1 + sumField(installed, 'sensor', 'range');
}

export function miningYieldMultiplier(installed: InstalledShipComponents): number {
  return 1 + bestField(installed, 'mining', 'yield');
}

export function salvageYieldMultiplier(installed: InstalledShipComponents): number {
  return 1 + bestField(installed, 'salvage', 'yield');
}

export function salvageChanceBonus(installed: InstalledShipComponents): number {
  return bestField(installed, 'salvage', 'chance');
}
