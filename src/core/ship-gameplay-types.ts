import type { ShipRole } from './ship-types';

export type ShipStationSkill =
  | 'piloting'
  | 'sensors'
  | 'weapons'
  | 'engineering'
  | 'mining'
  | 'salvage'
  | 'logistics';

export type ShipCargoMode = 'general' | 'mining' | 'salvage';

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

export interface ShipStationDefinition {
  readonly id: string;
  readonly skill: ShipStationSkill;
}

export type ShipComponentSlots = Readonly<Record<ShipComponentType, number>>;

export interface ShipRoleProfile {
  readonly role: ShipRole;
  readonly hullPoints: number;
  readonly fuelCapacity: number;
  readonly fuelUse: number;
  readonly weaponSlots: number;
  readonly crewCapacity: number;
  readonly maxComponentTier: number;
  readonly cargoMode: ShipCargoMode;
  readonly stations: readonly ShipStationDefinition[];
  readonly componentSlots: ShipComponentSlots;
}

export interface ShipComponentDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: ShipComponentType;
  readonly tier: number;
  readonly powerDraw: number;
  readonly reactorOutput?: number;
  readonly speedBonus?: number;
  readonly shieldHpBonus?: number;
  readonly hullHpBonus?: number;
  readonly sensorRangeBonus?: number;
  readonly cargoCapacityBonusTons?: number;
  readonly yieldBonus?: number;
  readonly chanceBonus?: number;
}

export type ShipComponentLoadout = Readonly<Partial<Record<ShipComponentType, readonly string[]>>>;

export interface ShipEnergyStats {
  readonly output: number;
  readonly baseUsed: number;
  readonly baseFree: number;
  readonly shieldUsed: number;
  readonly weaponsUsed: number;
  readonly combatUsed: number;
  readonly combatFree: number;
}

export interface ShipDerivedStats {
  readonly hullMax: number;
  readonly shieldMaxHp: number;
  readonly shieldModifier: number;
  readonly cruiseSpeed: number;
  readonly fuelCapacity: number;
  readonly fuelUse: number;
  readonly cargoCapacityTons: number;
  readonly sensorRangeMultiplier: number;
  readonly miningYieldMultiplier: number;
  readonly salvageYieldMultiplier: number;
  readonly salvageChanceBonus: number;
  readonly weaponSlots: number;
  readonly crewCapacity: number;
  readonly cargoMode: ShipCargoMode;
  readonly energy: ShipEnergyStats;
}

export type ShipCrewInjuryState =
  | 'healthy'
  | 'light-wound'
  | 'severe-wound'
  | 'incapacitated'
  | 'dead';

export interface ShipStationContributor {
  readonly skill: number;
  readonly traitModifier?: number;
  readonly injury?: ShipCrewInjuryState;
}
