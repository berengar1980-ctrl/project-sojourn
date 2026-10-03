export type ShipRole = 'mining' | 'freighter' | 'salvage' | 'patrol';

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
  readonly sprite: ShipSprite;
  readonly navigation: ShipNavigationStats;
}
