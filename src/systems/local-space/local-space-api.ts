import type { LocalSpaceSnapshot } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';

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
