import type { LocalSpaceInstance } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { MiningChunkCollector } from './mining-chunk-service';
import type { LocalSpaceSystemsOptions } from './local-space-ship-systems';

export interface LocalSpaceMiningOptions {
  readonly enabled: boolean;
  readonly cycleSeconds: number;
}

export interface LocalSpaceServiceOptions {
  readonly instance: LocalSpaceInstance;
  readonly approachSpeed: number;
  readonly hardpoints: ShipHardpoints;
  readonly nominalLengthMeters: number;
  readonly mining?: LocalSpaceMiningOptions;
  readonly systems?: LocalSpaceSystemsOptions;
  readonly onMiningChunkCollected?: MiningChunkCollector;
}
