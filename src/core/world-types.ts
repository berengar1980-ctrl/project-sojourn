import type { EconomyResourceId } from './economy-types';

export type LocationKind = 'planet' | 'moon' | 'station' | 'asteroid-field' | 'wreck';
export type PlanetBiome =
  'scorched' | 'desert' | 'temperate' | 'ice' | 'barren' | 'gas-giant';
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

export interface WorldRegion {
  readonly id: string;
  readonly name: string;
  readonly center: WorldPoint;
  readonly radius: number;
  readonly dangerLevel: 1 | 2 | 3;
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
}
