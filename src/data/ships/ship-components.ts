import type {
  ShipComponentDefinition,
  ShipComponentType,
} from '../../core/ship-gameplay-types';

type ComponentBonuses = Omit<
  Partial<ShipComponentDefinition>,
  'id' | 'name' | 'type' | 'tier' | 'powerDraw'
>;

function component(
  type: ShipComponentType,
  tier: number,
  name: string,
  powerDraw: number,
  bonuses: ComponentBonuses = {}
): ShipComponentDefinition {
  return {
    id: type + '-mk' + tier,
    name: name + ' Mk ' + tier,
    type,
    tier,
    powerDraw,
    ...bonuses,
  };
}

export const shipComponents: readonly ShipComponentDefinition[] = [
  component('reactor', 1, 'Reactor', 0, { reactorOutput: 40 }),
  component('reactor', 2, 'Reactor', 0, { reactorOutput: 55 }),
  component('reactor', 3, 'Reactor', 0, { reactorOutput: 72 }),
  component('reactor', 4, 'Reactor', 0, { reactorOutput: 128 }),
  component('reactor', 5, 'Reactor', 0, { reactorOutput: 160 }),
  component('reactor', 6, 'Reactor', 0, { reactorOutput: 198 }),

  component('engine', 1, 'Drive', 9, { speedBonus: 0 }),
  component('engine', 2, 'Drive', 13, { speedBonus: 0.12 }),
  component('engine', 3, 'Drive', 17, { speedBonus: 0.25 }),
  component('engine', 4, 'Drive', 22, { speedBonus: 0.4 }),
  component('engine', 5, 'Drive', 28, { speedBonus: 0.58 }),
  component('engine', 6, 'Drive', 35, { speedBonus: 0.78 }),

  component('shield', 1, 'Deflector Shield', 8, { shieldHpBonus: 0 }),
  component('shield', 2, 'Deflector Shield', 12, { shieldHpBonus: 18 }),
  component('shield', 3, 'Deflector Shield', 16, { shieldHpBonus: 36 }),
  component('shield', 4, 'Deflector Shield', 21, { shieldHpBonus: 56 }),
  component('shield', 5, 'Deflector Shield', 26, { shieldHpBonus: 80 }),
  component('shield', 6, 'Deflector Shield', 32, { shieldHpBonus: 108 }),

  component('hull', 1, 'Reinforced Hull', 0, { hullHpBonus: 0 }),
  component('hull', 2, 'Reinforced Hull', 0, { hullHpBonus: 16 }),
  component('hull', 3, 'Reinforced Hull', 0, { hullHpBonus: 32 }),
  component('hull', 4, 'Reinforced Hull', 0, { hullHpBonus: 50 }),
  component('hull', 5, 'Reinforced Hull', 0, { hullHpBonus: 72 }),
  component('hull', 6, 'Reinforced Hull', 0, { hullHpBonus: 98 }),

  component('sensor', 1, 'Sensor Array', 4, { sensorRangeBonus: 0 }),
  component('sensor', 2, 'Sensor Array', 6, { sensorRangeBonus: 0.15 }),
  component('sensor', 3, 'Sensor Array', 8, { sensorRangeBonus: 0.3 }),
  component('sensor', 4, 'Sensor Array', 10, { sensorRangeBonus: 0.45 }),
  component('sensor', 5, 'Sensor Array', 13, { sensorRangeBonus: 0.62 }),
  component('sensor', 6, 'Sensor Array', 16, { sensorRangeBonus: 0.82 }),

  component('cargo', 1, 'Cargo Module', 0, { cargoCapacityBonusTons: 30 }),
  component('cargo', 2, 'Cargo Module', 0, { cargoCapacityBonusTons: 45 }),
  component('cargo', 3, 'Cargo Module', 0, { cargoCapacityBonusTons: 65 }),
  component('cargo', 4, 'Cargo Module', 0, { cargoCapacityBonusTons: 90 }),
  component('cargo', 5, 'Cargo Module', 0, { cargoCapacityBonusTons: 120 }),
  component('cargo', 6, 'Cargo Module', 0, { cargoCapacityBonusTons: 155 }),

  component('mining', 1, 'Mining System', 9, { yieldBonus: 0 }),
  component('mining', 2, 'Mining System', 13, { yieldBonus: 0.15 }),
  component('mining', 3, 'Mining System', 17, { yieldBonus: 0.3 }),
  component('mining', 4, 'Mining System', 22, { yieldBonus: 0.48 }),
  component('mining', 5, 'Mining System', 28, { yieldBonus: 0.68 }),
  component('mining', 6, 'Mining System', 35, { yieldBonus: 0.92 }),

  component('salvage', 1, 'Salvage System', 7, { yieldBonus: 0, chanceBonus: 0 }),
  component('salvage', 2, 'Salvage System', 11, { yieldBonus: 0.15, chanceBonus: 5 }),
  component('salvage', 3, 'Salvage System', 15, { yieldBonus: 0.3, chanceBonus: 10 }),
  component('salvage', 4, 'Salvage System', 20, { yieldBonus: 0.48, chanceBonus: 15 }),
  component('salvage', 5, 'Salvage System', 26, { yieldBonus: 0.68, chanceBonus: 22 }),
  component('salvage', 6, 'Salvage System', 33, { yieldBonus: 0.92, chanceBonus: 30 }),
];

export const starterShipComponentIds: Readonly<Record<ShipComponentType, string | null>> = {
  reactor: 'reactor-mk1',
  engine: 'engine-mk1',
  shield: 'shield-mk1',
  hull: 'hull-mk1',
  sensor: 'sensor-mk1',
  weapon: null,
  cargo: 'cargo-mk1',
  mining: 'mining-mk1',
  salvage: 'salvage-mk1',
};
