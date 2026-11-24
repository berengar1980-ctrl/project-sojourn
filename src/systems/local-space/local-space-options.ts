import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { MiningChunkCollector } from './mining-chunk-service';
import type { LocalSpaceSystemsOptions } from './local-space-ship-systems';

export interface LocalSpaceMiningOptions {
  readonly enabled: boolean;
  readonly cycleSeconds: number;
  readonly yieldMultiplier?: number;
}

export interface LocalSpaceServiceOptions {
  readonly instance: LocalSpaceInstance;
  readonly approachSpeed: number;
  /** Fitted drive multiplier for maneuvering RCS, independent of travel speed. */
  readonly turnRateMultiplier?: number;
  readonly hardpoints: ShipHardpoints;
  readonly nominalLengthMeters: number;
  readonly mining?: LocalSpaceMiningOptions;
  readonly systems?: LocalSpaceSystemsOptions;
  readonly onMiningChunkCollected?: MiningChunkCollector;
  /** Actual assigned station skills, not a free ship-tier evasion bonus. */
  readonly hazardCrew?: { readonly piloting: number; readonly sensors: number };
  readonly avoidanceRandom?: () => number;
  readonly onNavigationNotice?: (message: string) => void;
  /** Dynamic wreck bodies owned by the salvage field; never integrated twice. */
  readonly additionalObstacles?: () => readonly LocalAsteroid[];
  /** Reflect collision impulses back to the recoverable saved wrecks. */
  readonly onAdditionalObstacleContact?: () => void;
}
