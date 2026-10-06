export type ShipRole = 'mining' | 'freighter' | 'salvage' | 'patrol';

export type ShipComponentType =
  'reactor' | 'engine' | 'shield' | 'hull' | 'sensor' | 'weapon' | 'cargo' | 'mining' | 'salvage';

export interface LooseShipComponent {
  readonly uid: string;
  readonly type: ShipComponentType;
  readonly componentId: string;
  readonly name: string;
  readonly tier: number;
  readonly cargoTons: number;
  readonly sourceWreckId: string;
}

export type ShipStationSkill =
  'piloting' | 'sensors' | 'weapons' | 'engineering' | 'mining' | 'salvage' | 'logistics';

export interface ShipStationDefinition {
  readonly id: string;
  readonly skill: ShipStationSkill;
}

export type ShipSpecialCargoKind = 'mining' | 'salvage';

export interface ShipSpecialCargoProfile {
  readonly kind: ShipSpecialCargoKind;
}

export interface ShipGameplayProfile {
  readonly hullPoints: number;
  readonly shieldModifier: number;
  readonly fuelCapacity: number;
  readonly fuelUse: number;
  readonly weaponSlots: number;
  readonly crewBerths: number;
  readonly maxComponentTier: number;
  readonly stations: readonly ShipStationDefinition[];
  readonly specialCargo: ShipSpecialCargoProfile | null;
}

export interface ShipGameplayOverrides {
  readonly hullPoints?: number;
  readonly shieldModifier?: number;
  readonly fuelCapacity?: number;
  readonly fuelUse?: number;
  readonly weaponSlots?: number;
  readonly crewBerths?: number;
  readonly maxComponentTier?: number;
  readonly specialCargo?: ShipSpecialCargoProfile | null;
}

export interface ResolvedShipGameplayStats extends ShipGameplayProfile {
  readonly cargoCapacityTons: number;
  readonly cruiseSpeed: number;
}

export interface ShipHardpoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface ShipPivot {
  readonly x: number;
  readonly y: number;
}

export interface ShipManeuverThruster extends ShipHardpoint {
  readonly forceX: number;
  readonly forceY: number;
}

export interface ShipShieldGeometry {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly maxHp: number;
  readonly modifier: number;
}

export interface ShipHardpoints {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly pivot: ShipPivot;
  readonly engines: readonly ShipHardpoint[];
  readonly miningLasers: readonly ShipHardpoint[];
  readonly maneuverThrusters: readonly ShipManeuverThruster[];
  readonly shield: ShipShieldGeometry;
}

export interface ShipSprite {
  readonly assetUrl: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly facing: 'right';
  readonly hardpoints: ShipHardpoints;
}

export interface ShipNavigationStats {
  readonly cruiseSpeed: number;
}

export interface ShipDefinition {
  readonly id: string;
  readonly name: string;
  readonly role: ShipRole;
  readonly nominalLengthMeters: number;
  readonly cargoCapacityTons: number;
  readonly sprite: ShipSprite;
  readonly navigation: ShipNavigationStats;
  readonly gameplayOverrides?: ShipGameplayOverrides;
}
