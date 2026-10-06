export type ShipComponentType =
  | 'reactor'
  | 'engine'
  | 'shield'
  | 'hull'
  | 'sensor'
  | 'weapon'
  | 'cargo'
  | 'mining'
  | 'salvage';

export interface ShipComponentDefinition {
  readonly id: string;
  readonly type: ShipComponentType;
  readonly name: string;
  readonly tier: number;
  readonly power: number;
  readonly cost: number;
  readonly output?: number;
  readonly speed?: number;
  readonly bonus?: number;
  readonly range?: number;
  readonly yield?: number;
  readonly chance?: number;
}

type ComponentSeed = readonly [
  id: string,
  name: string,
  tier: number,
  power: number,
  cost: number,
  effect?: number,
  chance?: number,
];

function definitions(
  type: ShipComponentType,
  seeds: readonly ComponentSeed[],
  effectKey?: 'output' | 'speed' | 'bonus' | 'range' | 'yield'
): readonly ShipComponentDefinition[] {
  return seeds.map(([id, name, tier, power, cost, effect, chance]) => ({
    id,
    type,
    name,
    tier,
    power,
    cost,
    ...(effectKey && effect !== undefined ? { [effectKey]: effect } : {}),
    ...(chance !== undefined ? { chance } : {}),
  }));
}

export const SHIP_COMPONENT_CATALOG: Readonly<
  Partial<Record<ShipComponentType, readonly ShipComponentDefinition[]>>
> = {
  reactor: definitions(
    'reactor',
    [
      ['reactor1', 'Plasma Reactor Mk I', 1, 0, 0, 40],
      ['reactor2', 'Plasma Reactor Mk II', 2, 0, 900000, 55],
      ['reactor3', 'Plasma Reactor Mk III', 3, 0, 1800000, 72],
      ['reactor4', 'Plasma Reactor Mk IV', 4, 0, 3000000, 128],
      ['reactor5', 'Plasma Reactor Mk V', 5, 0, 5000000, 160],
      ['reactor6', 'Plasma Reactor Mk VI', 6, 0, 8000000, 198],
    ],
    'output'
  ),
  engine: definitions(
    'engine',
    [
      ['engine1', 'Plasma Drive Mk I', 1, 9, 0, 0],
      ['engine2', 'Plasma Drive Mk II', 2, 13, 700000, 0.12],
      ['engine3', 'Plasma Drive Mk III', 3, 17, 1450000, 0.25],
      ['engine4', 'Plasma Drive Mk IV', 4, 22, 2300000, 0.4],
      ['engine5', 'Plasma Drive Mk V', 5, 28, 4000000, 0.58],
      ['engine6', 'Plasma Drive Mk VI', 6, 35, 6500000, 0.78],
    ],
    'speed'
  ),
  shield: definitions(
    'shield',
    [
      ['shield1', 'Deflector Grid Mk I', 1, 8, 0, 0],
      ['shield2', 'Deflector Grid Mk II', 2, 12, 800000, 18],
      ['shield3', 'Deflector Grid Mk III', 3, 16, 1650000, 36],
      ['shield4', 'Deflector Grid Mk IV', 4, 21, 2500000, 56],
      ['shield5', 'Deflector Grid Mk V', 5, 26, 4400000, 80],
      ['shield6', 'Deflector Grid Mk VI', 6, 32, 7200000, 108],
    ],
    'bonus'
  ),
  hull: definitions(
    'hull',
    [
      ['hull1', 'Reinforced Hull Mk I', 1, 0, 0, 0],
      ['hull2', 'Reinforced Hull Mk II', 2, 0, 650000, 16],
      ['hull3', 'Reinforced Hull Mk III', 3, 0, 1350000, 32],
      ['hull4', 'Reinforced Hull Mk IV', 4, 0, 2000000, 50],
      ['hull5', 'Reinforced Hull Mk V', 5, 0, 3500000, 72],
      ['hull6', 'Reinforced Hull Mk VI', 6, 0, 5800000, 98],
    ],
    'bonus'
  ),
  sensor: definitions(
    'sensor',
    [
      ['sensor1', 'Sensor Array Mk I', 1, 4, 0, 0],
      ['sensor2', 'Sensor Array Mk II', 2, 6, 550000, 0.15],
      ['sensor3', 'Sensor Array Mk III', 3, 8, 1150000, 0.3],
      ['sensor4', 'Sensor Array Mk IV', 4, 10, 1800000, 0.45],
      ['sensor5', 'Sensor Array Mk V', 5, 13, 3200000, 0.62],
      ['sensor6', 'Sensor Array Mk VI', 6, 16, 5400000, 0.82],
    ],
    'range'
  ),
  cargo: definitions(
    'cargo',
    [
      ['cargo1', 'Cargo Module Mk I', 1, 0, 0, 30],
      ['cargo2', 'Cargo Module Mk II', 2, 0, 600000, 45],
      ['cargo3', 'Cargo Module Mk III', 3, 0, 1250000, 65],
      ['cargo4', 'Cargo Module Mk IV', 4, 0, 1900000, 90],
      ['cargo5', 'Cargo Module Mk V', 5, 0, 3300000, 120],
      ['cargo6', 'Cargo Module Mk VI', 6, 0, 5200000, 155],
    ],
    'bonus'
  ),
  mining: definitions(
    'mining',
    [
      ['mining1', 'Mining Laser Mk I', 1, 9, 0, 0],
      ['mining2', 'Mining Laser Mk II', 2, 13, 750000, 0.15],
      ['mining3', 'Mining Laser Mk III', 3, 17, 1550000, 0.3],
      ['mining4', 'Mining Laser Mk IV', 4, 22, 2400000, 0.48],
      ['mining5', 'Mining Laser Mk V', 5, 28, 4200000, 0.68],
      ['mining6', 'Mining Laser Mk VI', 6, 35, 6800000, 0.92],
    ],
    'yield'
  ),
  salvage: definitions(
    'salvage',
    [
      ['salvage1', 'Salvage Module Mk I', 1, 7, 0, 0, 0],
      ['salvage2', 'Salvage Module Mk II', 2, 11, 750000, 0.15, 5],
      ['salvage3', 'Salvage Module Mk III', 3, 15, 1550000, 0.3, 10],
      ['salvage4', 'Salvage Module Mk IV', 4, 20, 2400000, 0.48, 15],
      ['salvage5', 'Salvage Module Mk V', 5, 26, 4200000, 0.68, 22],
      ['salvage6', 'Salvage Module Mk VI', 6, 33, 6800000, 0.92, 30],
    ],
    'yield'
  ),
};
