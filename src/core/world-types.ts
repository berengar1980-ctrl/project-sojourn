import type { EconomyResourceId } from './economy-types';

export type LocationKind = 'planet' | 'moon' | 'station' | 'asteroid-field' | 'wreck';
export type PlanetBiome = 'scorched' | 'desert' | 'temperate' | 'ice' | 'barren' | 'gas-giant';
export type PlanetRingStyle = 'thin' | 'broad' | 'asteroid';
export type StationType =
  'trade' | 'shipyard' | 'military' | 'refinery' | 'research' | 'pirate' | 'utility';

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface StarBody {
  readonly id: string;
  readonly name: string;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly colorCore: string;
  readonly colorCorona: string;
}

export interface LocationActivities {
  readonly dock?: boolean;
  readonly trade?: boolean;
  readonly mine?: boolean;
  readonly salvage?: boolean;
  readonly refuel?: boolean;
  readonly missions?: boolean;
  readonly shipyard?: boolean;
}

export interface WorldLocation {
  readonly id: string;
  readonly name: string;
  readonly kind: LocationKind;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly description: string;
  readonly activities: LocationActivities;
  readonly dangerLevel: 0 | 1 | 2 | 3;
  readonly orbitRadius?: number;
  readonly parentLocationId?: string;
  readonly planetBiome?: PlanetBiome;
  readonly ringStyle?: PlanetRingStyle;
  readonly stationType?: StationType;
  readonly showOrbit?: boolean;
  readonly minedResourceIds?: readonly EconomyResourceId[];
  readonly spriteUrl?: string;
}

/** Irregular fixed-zone clouds and connecting shipping corridors, shared by rendering and routing. */
export interface WorldRegionLobe {
  readonly center: WorldPoint;
  readonly radiusX: number;
  readonly radiusY: number;
}

export interface WorldRegionCorridor {
  readonly from: WorldPoint;
  readonly to: WorldPoint;
  readonly width: number;
}

export interface WorldRegion {
  readonly id: string;
  readonly name: string;
  readonly center: WorldPoint;
  /** Circular fallback for older maps; curated cloud maps use lobes instead. */
  readonly radius: number;
  readonly dangerLevel: 1 | 2 | 3;
  readonly lobes?: readonly WorldRegionLobe[];
  readonly corridors?: readonly WorldRegionCorridor[];
  /** Fixed spatial calibration, not a dynamic danger multiplier. */
  readonly scale?: number;
}

export interface WorldMap {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly startLocationId: string;
  readonly star: StarBody;
  readonly locations: readonly WorldLocation[];
  readonly regions: readonly WorldRegion[];
  /** Curated worlds may use red frontier as the base with carved transit and safe passages. */
  readonly defaultDangerLevel?: 0 | 1 | 2 | 3;
}
