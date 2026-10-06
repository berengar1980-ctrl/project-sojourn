import type { NpcEconomyState } from './economy-types';
import type { ShipComponentType, ShipRole } from './ship-types';

export type NpcJob = 'freighter' | 'miner' | 'salvager' | 'patrol';
export type NpcTravelProfile = 'fast' | 'balanced' | 'safe';

export interface NpcTravelState {
  readonly finalTargetId: string;
  targetLocationId: string;
  readonly routePoints: readonly { readonly x: number; readonly y: number }[];
  readonly routeDistance: number;
  distanceTravelled: number;
  readonly fuelRequired: number;
  readonly profile: NpcTravelProfile;
  readonly refuelStops: readonly string[];
}

export type NpcInstalledComponents = Partial<Record<ShipComponentType, string[]>>;

export interface SectorNpcState extends NpcEconomyState {
  readonly name: string;
  readonly job: NpcJob;
  shipId: string;
  fuel: number;
  fuelCapacity: number;
  fuelUse: number;
  aggression: number;
  activityId: string;
  activity: string;
  successfulRuns: number;
  installedComponents?: NpcInstalledComponents;
  componentUpgradeCount?: number;
  lastComponentUpgradeRun?: number;
  travel?: NpcTravelState;
}

export function npcJobShipRole(job: NpcJob): ShipRole {
  if (job === 'freighter') return 'freighter';
  if (job === 'miner') return 'mining';
  if (job === 'salvager') return 'salvage';
  return 'patrol';
}
