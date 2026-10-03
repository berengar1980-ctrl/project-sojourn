export type ShipRole = 'mining' | 'freighter' | 'salvage' | 'patrol';

export interface ShipSprite {
  readonly assetUrl: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly facing: 'right';
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
