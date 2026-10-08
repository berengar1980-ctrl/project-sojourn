import type { NpcEconomyState } from './economy-types';
import type { ShipComponentType, ShipRole } from './ship-types';
import type { WorldPoint } from './world-types';

export type NpcJob = 'freighter' | 'miner' | 'salvager' | 'patrol' | 'pirate';
export type NpcFactionId = 'civilian' | 'pirates' | 'pirates2';
export type NpcTravelProfile = 'fast' | 'balanced' | 'safe';
export type NpcWorkRiskPreference = 'safe' | 'risky';
export type NpcCombatTargetKind = 'player' | 'npc';
export type NpcCombatMovementMode = 'pursue' | 'flee' | 'engaged';

export interface NpcWorkEventRecord {
  readonly kind: 'mining' | 'salvage';
  readonly title: string;
  readonly choiceId: string;
  readonly risk: 'safe' | 'controlled' | 'risky' | 'high_risk';
  readonly resultText: string;
}

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

export interface NpcCombatMovementState {
  mode: NpcCombatMovementMode;
  readonly targetKind: NpcCombatTargetKind;
  readonly targetId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
}

export type NpcInstalledComponents = Partial<Record<ShipComponentType, string[]>>;

export interface SectorNpcState extends NpcEconomyState {
  readonly name: string;
  readonly job: NpcJob;
  shipId: string;
  fuel: number;
  fuelCapacity: number;
  fuelUse: number;
  hullHp: number;
  hullMaxHp: number;
  aggression: number;
  factionId?: NpcFactionId;
  pirate?: boolean;
  pirateMark?: 'broken-spear' | 'black-tide';
  pirateHuntZoneId?: string;
  pirateHuntCycles?: number;
  combatRecoverySeconds?: number;
  combatRecoveryLocationId?: string;
  combatDefeats?: number;
  workRiskPreference: NpcWorkRiskPreference;
  lastWorkEvent?: NpcWorkEventRecord;
  activityId: string;
  activity: string;
  successfulRuns: number;
  installedComponents?: NpcInstalledComponents;
  salvageComponents?: { type: ShipComponentType; componentId: string }[];
  salvageEventId?: string;
  componentUpgradeCount?: number;
  lastComponentUpgradeRun?: number;
  travel?: NpcTravelState;
  combatMovement?: NpcCombatMovementState;
}

export function npcJobShipRole(job: NpcJob): ShipRole {
  if (job === 'freighter') return 'freighter';
  if (job === 'miner') return 'mining';
  if (job === 'salvager') return 'salvage';
  return 'patrol';
}
