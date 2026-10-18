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

interface ParsedVariantId {
  readonly source: 'special' | 'yard';
  readonly modifier: 'efficiency' | 'damage' | 'performance';
  readonly pct: number;
  readonly baseId: string;
}

function parseVariantId(id: string): ParsedVariantId | null {
  const match = /^(special|yard)_(efficiency|damage|performance)_(\d+)_(.+)$/.exec(id);
  if (!match) return null;
  const [, source, modifier, rawPct, baseId] = match;
  const pct = Number(rawPct);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100 || !baseId) return null;
  return {
    source: source as ParsedVariantId['source'],
    modifier: modifier as ParsedVariantId['modifier'],
    pct,
    baseId,
  };
}

function variantWeapon(
  base: ShipComponentDefinition,
  modifier: ParsedVariantId['modifier'],
  pct: number
) {
  if (modifier !== 'damage' || !base.weapon) return base.weapon;
  return {
    ...base.weapon,
    shieldDamage: Math.round(base.weapon.shieldDamage * (1 + pct / 100) * 10) / 10,
    hullDamage: Math.round(base.weapon.hullDamage * (1 + pct / 100) * 10) / 10,
  };
}

function variantCost(
  base: ShipComponentDefinition,
  type: ShipComponentType,
  modifier: ParsedVariantId['modifier'],
  pct: number,
  special: boolean
): number {
  if (special) return base.cost;
  if (type !== 'weapon') {
    return Math.round((Math.max(200000, base.cost) * (1 + pct * 0.025)) / 5000) * 5000;
  }
  const multiplier = modifier === 'efficiency' ? 1 + pct * 0.02 : 1 + pct * 0.03;
  return Math.round((Math.max(350000, base.cost) * multiplier) / 5000) * 5000;
}

function variantName(
  base: ShipComponentDefinition,
  modifier: ParsedVariantId['modifier'],
  pct: number,
  special: boolean
): string {
  if (modifier === 'efficiency') {
    return `${base.name} – ${special ? 'Effiziente Ausführung' : 'Effizient'} (−${pct} % Energie)`;
  }
  if (modifier === 'performance') return `${base.name} – Leistungsoptimiert (+${pct} %)`;
  return `${base.name} – ${special ? 'Überladene Ausführung' : 'Leistungsoptimiert'} (+${pct} % Schaden)`;
}

function performanceFields(
  base: ShipComponentDefinition,
  pct: number
): Partial<ShipComponentDefinition> {
  const boost = (value: number, minimum = 0): number =>
    Math.round((value === 0 ? minimum : value * (1 + pct / 100)) * 100) / 100;
  return {
    ...(base.output !== undefined ? { output: boost(base.output) } : {}),
    ...(base.speed !== undefined ? { speed: boost(base.speed, pct / 100) } : {}),
    ...(base.bonus !== undefined ? { bonus: boost(base.bonus, pct) } : {}),
    ...(base.range !== undefined ? { range: boost(base.range, pct / 100) } : {}),
    ...(base.yield !== undefined ? { yield: boost(base.yield, pct / 100) } : {}),
    ...(base.chance !== undefined ? { chance: boost(base.chance, pct) } : {}),
    ...(base.weapon
      ? {
          weapon: {
            ...base.weapon,
            shieldDamage: boost(base.weapon.shieldDamage),
            hullDamage: boost(base.weapon.hullDamage),
          },
        }
      : {}),
    ...(base.mine
      ? {
          mine: {
            ...base.mine,
            shieldDamage: boost(base.mine.shieldDamage),
            hullDamage: boost(base.mine.hullDamage),
          },
        }
      : {}),
  };
}

function variantDefinition(
  type: ShipComponentType,
  id: string,
  depth = 0
): ShipComponentDefinition | null {
  if (depth > 8) return null;
  const parsed = parseVariantId(id);
  if (!parsed) return null;
  if (parsed.modifier === 'damage' && type !== 'weapon') return null;

  const base = getShipComponentInternal(type, parsed.baseId, depth + 1);
  if (!base) return null;
  if (parsed.modifier === 'efficiency' && base.power <= 0) return null;

  const special = parsed.source === 'special';
  return {
    ...base,
    id,
    cost: variantCost(base, type, parsed.modifier, parsed.pct, special),
    baseId: base.id,
    specialSalvage: special,
    shipyardVariant: !special,
    salvageModifier: parsed.modifier,
    salvageModifierPct: parsed.pct,
    name: variantName(base, parsed.modifier, parsed.pct, special),
    power:
      parsed.modifier === 'efficiency'
        ? Math.max(0, base.power - Math.ceil((base.power * parsed.pct) / 100))
        : base.power,
    ...(base.weapon ? { weapon: variantWeapon(base, parsed.modifier, parsed.pct) } : {}),
    ...(parsed.modifier === 'performance' ? performanceFields(base, parsed.pct) : {}),
  };
}

function getShipComponentInternal(
  type: ShipComponentType,
  id: string,
  depth: number
): ShipComponentDefinition | null {
  return (
    SHIP_COMPONENT_CATALOG[type]?.find((component) => component.id === id) ??
    variantDefinition(type, id, depth)
  );
}

export function getShipComponent(
  type: ShipComponentType,
  id: string
): ShipComponentDefinition | null {
  return getShipComponentInternal(type, id, 0);
}

export function createSpecialSalvageComponentId(
  type: ShipComponentType,
  baseId: string,
  modifier: 'efficiency' | 'damage' | 'performance',
  percent: number
): string | null {
  const pct = Math.max(1, Math.min(100, Math.round(percent)));
  const id = `special_${modifier}_${pct}_${baseId}`;
  return getShipComponent(type, id) ? id : null;
}

export function createShipyardVariantId(
  type: ShipComponentType,
  baseId: string,
  modifier: 'efficiency' | 'damage' | 'performance',
  percent: number
): string | null {
  const pct = Math.max(1, Math.min(100, Math.round(percent)));
  const id = `yard_${modifier}_${pct}_${baseId}`;
  return getShipComponent(type, id) ? id : null;
}

export function salvagedComponentAppraisal(
  type: ShipComponentType,
  id: string
): { readonly market: number; readonly sell: number; readonly rare: boolean } {
  const component = getShipComponent(type, id);
  if (!component) return { market: 0, sell: 0, rare: false };
  const base = component.baseId
    ? (getShipComponent(type, component.baseId) ?? component)
    : component;
  const intrinsic = Math.max(
    180000,
    Number(base.cost || 0) || Math.round(240000 * Math.max(1, base.tier))
  );
  const rare = Boolean(component.specialSalvage);
  const pct = Math.max(0, Number(component.salvageModifierPct ?? 0));
  const premium =
    component.salvageModifier === 'damage' || component.salvageModifier === 'performance'
      ? Math.min(0.75, pct * 0.06)
      : component.salvageModifier === 'efficiency'
        ? Math.min(0.75, pct * 0.04)
        : 0;
  const market = Math.round(intrinsic * (rare ? 2.1 : 1) * (1 + premium));
  return { market, sell: Math.round(market * 0.45), rare };
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

/** Independent directional protection; hull modules still increase hit points. */
export function resolveShipArmorProtection(installed: InstalledShipComponents) {
  return getShipComponent('armor', installed.armor?.[0] ?? '')?.armor;
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
