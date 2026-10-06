import type { LocalSpaceInstance, LocalSpaceSnapshot } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import type { MiningChunkCollector } from './mining-chunk-service';
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';

export interface LocalSpaceMiningOptions {
  readonly enabled: boolean;
  readonly cycleSeconds: number;
}

export interface LocalSpaceDefenseOptions {
  readonly hullMaxHp: number;
  readonly shieldMaxHp: number;
  readonly shieldDamageModifier: number;
  readonly shieldPowered: boolean;
}

export interface LocalSpaceSensorOptions {
  readonly modifier: number;
  readonly crewSkill: number;
}

export interface LocalSpaceServiceOptions {
  readonly instance: LocalSpaceInstance;
  readonly approachSpeed: number;
  readonly hardpoints: ShipHardpoints;
  readonly nominalLengthMeters: number;
  readonly mining?: LocalSpaceMiningOptions;
  readonly defense?: LocalSpaceDefenseOptions;
  readonly sensors?: LocalSpaceSensorOptions;
  readonly onMiningChunkCollected?: MiningChunkCollector;
}

export interface LocalSpaceService {
  getSnapshot(): LocalSpaceSnapshot;
  selectAsteroid(id: string | null): LocalSpaceSnapshot;
  getMiningRouteOptions(): RoutePlanningOptions | null;
  getShortRangeScanRouteOptions(): RoutePlanningOptions | null;
  getPointRouteOptions(target: WorldPoint): PointRoutePlanningOptions;
  startLongRangeScan(sensorModifier?: number, crewSkill?: number): LocalSpaceSnapshot;
  startNavigation(target: WorldPoint, route: readonly WorldPoint[]): LocalSpaceSnapshot;
  startMining(route: readonly WorldPoint[]): LocalSpaceSnapshot;
  startShortRangeScan(route: readonly WorldPoint[]): LocalSpaceSnapshot;
  cancelMining(): LocalSpaceSnapshot;
  tick(deltaSeconds: number): LocalSpaceSnapshot;
}
