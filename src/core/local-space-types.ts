import type { WorldPoint } from './world-types';

export type LocalAsteroidKind = 'resource' | 'debris';

export interface AsteroidPhysics {
  readonly mass: number;
  readonly centerOfMassOffset: WorldPoint;
  velocity: WorldPoint;
  angularVelocity: number;
  readonly momentOfInertia: number;
}

export interface LocalAsteroid {
  readonly id: string;
  readonly kind: LocalAsteroidKind;
  readonly routeBlocking: boolean;
  position: WorldPoint;
  radius: number;
  rotation: number;
  physics: AsteroidPhysics;
  oreType: string;
  oreRemaining: number;
  oreCapacity: number;
}

export interface MiningImpact {
  readonly point: WorldPoint;
  readonly normal: WorldPoint;
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
  readonly miningImpact: MiningImpact | null;
  readonly shieldFlash: number;
}
