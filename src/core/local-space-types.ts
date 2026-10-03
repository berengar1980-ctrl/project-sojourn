import type { WorldPoint } from './world-types';

export interface LocalAsteroid {
  readonly id: string;
  position: WorldPoint;
  radius: number;
  rotation: number;
  oreType: string;
  oreRemaining: number;
  oreCapacity: number;
}

export interface MiningChunk {
  readonly id: string;
  position: WorldPoint;
  velocity: WorldPoint;
  amount: number;
  ageSeconds: number;
  tractorActive: boolean;
}

export interface LocalShipState {
  position: WorldPoint;
  headingRadians: number;
  speed: number;
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

export type MiningPhase = 'idle' | 'approaching' | 'extracting';

export interface LocalSpaceSnapshot {
  readonly instance: LocalSpaceInstance;
  readonly selectedAsteroidId: string | null;
  readonly miningTargetId: string | null;
  readonly miningPhase: MiningPhase;
  readonly collectedOre: number;
  readonly laserActive: boolean;
}
