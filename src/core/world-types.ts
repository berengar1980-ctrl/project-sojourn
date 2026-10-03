export type LocationKind = 'planet' | 'station' | 'asteroid-field' | 'wreck';

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
