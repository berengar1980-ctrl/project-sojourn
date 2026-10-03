export type ShipRole = 'mining' | 'freighter' | 'salvage' | 'patrol';

export interface ShipEngineAnchor {
  readonly x: number;
  readonly y: number;
}

export interface ShipSprite {
  readonly assetUrl: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly facing: 'right';
  readonly engineAnchors: readonly ShipEngineAnchor[];
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
