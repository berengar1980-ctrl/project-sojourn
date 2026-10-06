import type { ShipMineDefinition, ShipMineKind } from '../../core/combat-types';

interface MineSeed {
  readonly kind: ShipMineKind;
  readonly name: string;
  readonly shieldDamage: number;
  readonly hullDamage: number;
  readonly stealth: number;
  readonly triggerRadiusMeters: number;
  readonly blastRadiusMeters: number;
  readonly pursuitSeconds: number;
  readonly pursuitSpeedMetersPerSecond: number;
  readonly cost: number;
}

const ROMAN_TIERS = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;
const DAMAGE_SCALE = [1, 1.3, 1.65, 2.05, 2.5, 3] as const;
const RANGE_SCALE = [1, 1.05, 1.1, 1.15, 1.2, 1.25] as const;
const COST_SCALE = [1, 1.7, 2.8, 4.3, 6.4, 9.2] as const;

const MINE_SEEDS: readonly MineSeed[] = [
  {
    kind: 'ion',
    name: 'Ion Mine',
    shieldDamage: 65,
    hullDamage: 5,
    stealth: 42,
    triggerRadiusMeters: 90,
    blastRadiusMeters: 65,
    pursuitSeconds: 0,
    pursuitSpeedMetersPerSecond: 0,
    cost: 120000,
  },
  {
    kind: 'shaped_charge',
    name: 'Shaped-Charge Mine',
    shieldDamage: 10,
    hullDamage: 75,
    stealth: 55,
    triggerRadiusMeters: 70,
    blastRadiusMeters: 45,
    pursuitSeconds: 0,
    pursuitSpeedMetersPerSecond: 0,
    cost: 150000,
  },
  {
    kind: 'hunter',
    name: 'Hunter Mine',
    shieldDamage: 40,
    hullDamage: 40,
    stealth: 70,
    triggerRadiusMeters: 110,
    blastRadiusMeters: 55,
    pursuitSeconds: 4,
    pursuitSpeedMetersPerSecond: 130,
    cost: 220000,
  },
];

function scaled(value: number, multiplier: number): number {
  return Math.max(1, Math.round(value * multiplier));
}

function definitions(seed: MineSeed): readonly ShipMineDefinition[] {
  return ROMAN_TIERS.map((roman, index) => {
    const tier = index + 1;
    const damageScale = DAMAGE_SCALE[index] ?? 1;
    const rangeScale = RANGE_SCALE[index] ?? 1;
    const costScale = COST_SCALE[index] ?? 1;

    return {
      id: `mine-${seed.kind.replace('_', '-')}-${tier}`,
      kind: seed.kind,
      name: `${seed.name} Mk ${roman}`,
      tier,
      cost: Math.round(seed.cost * costScale),
      shieldDamage: scaled(seed.shieldDamage, damageScale),
      hullDamage: scaled(seed.hullDamage, damageScale),
      stealth: seed.stealth + index * 2,
      triggerRadiusMeters: scaled(seed.triggerRadiusMeters, rangeScale),
      blastRadiusMeters: scaled(seed.blastRadiusMeters, rangeScale),
      pursuitSeconds:
        seed.pursuitSeconds === 0 ? 0 : Number((seed.pursuitSeconds + index * 0.35).toFixed(2)),
      pursuitSpeedMetersPerSecond:
        seed.pursuitSpeedMetersPerSecond === 0
          ? 0
          : scaled(seed.pursuitSpeedMetersPerSecond, rangeScale),
    };
  });
}

export const SHIP_MINE_CATALOG: readonly ShipMineDefinition[] = MINE_SEEDS.flatMap(definitions);

export function getShipMine(id: string): ShipMineDefinition | null {
  return SHIP_MINE_CATALOG.find((mine) => mine.id === id) ?? null;
}

export function getShipMinesByKind(kind: ShipMineKind): readonly ShipMineDefinition[] {
  return SHIP_MINE_CATALOG.filter((mine) => mine.kind === kind);
}
