import type { AsteroidScanLevel } from './resource-types';
import type { ShieldImpactEffect, ShieldState } from './shield-types';
import type { WorldPoint } from './world-types';
import type { ManeuveringShipState } from './physical-ship-state';

export type LocalAsteroidKind = 'resource' | 'debris';

export interface AsteroidPhysics {
  readonly mass: number;
  readonly centerOfMassOffset: WorldPoint;
  velocity: WorldPoint;
  angularVelocity: number;
  readonly momentOfInertia: number;
}

export interface AsteroidResourceDeposit {
  readonly resourceId: string;
  readonly oreType: string;
  oreRemaining: number;
  oreCapacity: number;
  identified: boolean;
}

export interface LocalAsteroid {
  readonly id: string;
  readonly kind: LocalAsteroidKind;
  readonly routeBlocking: boolean;
  position: WorldPoint;
  radius: number;
  /** Broad-phase/navigation bound; radius stays the visual scale. */
  readonly collisionRadius?: number;
  /** Natural rocks use the same seeded contour for render and narrow-phase physics. */
  readonly contactGeometry?: 'silhouette';
  rotation: number;
  physics: AsteroidPhysics;
  readonly deposits: AsteroidResourceDeposit[];
  scanLevel: AsteroidScanLevel;
}

export interface MiningImpact {
  readonly point: WorldPoint;
  readonly normal: WorldPoint;
}

export interface MiningChunk {
  readonly id: string;
  readonly sourceAsteroidId: string;
  readonly resourceId: string;
  position: WorldPoint;
  velocity: WorldPoint;
  amount: number;
  ageSeconds: number;
  tractorActive: boolean;
  tractorHardpointId: string | null;
}

export interface ResourceCargoEntry {
  readonly resourceId: string;
  readonly amount: number;
}

export interface LocalHullState {
  readonly maxHp: number;
  currentHp: number;
}

export interface LocalReactorState {
  readonly output: number;
  readonly continuousUsed: number;
  readonly continuousFree: number;
}

export interface LocalShipState extends ManeuveringShipState {
  /** The sole authoritative translational velocity in world coordinates. */
  /** Signed forward projection of velocity; it is never an independent state value. */
  readonly speed: number;
  lateralThrust: number;
}

export interface LocalSpaceInstance {
  readonly id: string;
  readonly sourceLocationId: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly asteroids: LocalAsteroid[];
  readonly chunks: MiningChunk[];
  readonly ship: LocalShipState;
}

export type MiningPhase = 'idle' | 'approaching' | 'scanning' | 'extracting';
export type MiningResourceSelection = readonly string[] | null;

export type MiningEventType = 'unstable' | 'machine' | 'rich' | 'cavity' | 'rare' | 'deeper';
export type MiningEventRisk = 'safe' | 'controlled' | 'risky' | 'high_risk';

export interface MiningEventChoice {
  readonly id: string;
  readonly label: string;
  readonly risk: MiningEventRisk;
  readonly riskLabel: string;
}

export interface MiningEventState {
  readonly id: string;
  readonly type: MiningEventType;
  readonly title: string;
  readonly description: string;
  readonly extractionProgress: number;
  readonly choices: readonly MiningEventChoice[];
}

export interface MiningEventResolution {
  readonly title: string;
  readonly resultText: string;
  readonly aborted: boolean;
}

export interface LocalSpaceSnapshot {
  readonly instance: LocalSpaceInstance;
  readonly selectedAsteroidId: string | null;
  readonly miningTargetId: string | null;
  readonly scanTargetId: string | null;
  readonly navigationTarget: WorldPoint | null;
  readonly navigationRoute: readonly WorldPoint[];
  readonly longRangeScanProgress: number | null;
  readonly shortRangeScanProgress: number | null;
  readonly miningPhase: MiningPhase;
  readonly miningAvailable: boolean;
  readonly miningResourceSelection: MiningResourceSelection;
  readonly miningEvent: MiningEventState | null;
  readonly miningRecoverySeconds: number;
  readonly scanAvailable: boolean;
  readonly hull: LocalHullState;
  readonly reactor: LocalReactorState;
  readonly collectedOre: number;
  readonly collectedResources: readonly ResourceCargoEntry[];
  readonly laserActive: boolean;
  readonly miningImpact: MiningImpact | null;
  readonly shield: ShieldState;
  readonly shieldImpacts: readonly ShieldImpactEffect[];
}
