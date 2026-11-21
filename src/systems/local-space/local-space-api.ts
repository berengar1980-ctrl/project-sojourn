import type {
  LocalSpaceSnapshot,
  MiningEventResolution,
  MiningResourceSelection,
} from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';

export interface LocalSpaceService {
  getSnapshot(): LocalSpaceSnapshot;
  getShipWorldVelocity(): WorldPoint;
  selectAsteroid(id: string | null): LocalSpaceSnapshot;
  setMiningResourceSelection(resourceIds: MiningResourceSelection): LocalSpaceSnapshot;
  getMiningRouteOptions(): RoutePlanningOptions | null;
  getShortRangeScanRouteOptions(): RoutePlanningOptions | null;
  getPointRouteOptions(target: WorldPoint): PointRoutePlanningOptions;
  startLongRangeScan(sensorModifier?: number, crewSkill?: number): LocalSpaceSnapshot;
  startNavigation(target: WorldPoint, route: readonly WorldPoint[]): LocalSpaceSnapshot;
  startMining(route: readonly WorldPoint[]): LocalSpaceSnapshot;
  startShortRangeScan(route: readonly WorldPoint[]): LocalSpaceSnapshot;
  resolveMiningEvent(choiceId: string): MiningEventResolution | null;
  cancelMining(): LocalSpaceSnapshot;
  syncCombatPose(position: WorldPoint, headingRadians: number, speed: number): LocalSpaceSnapshot;
  /** Preserve live navigation when FleetCombat shares this local field. */
  syncFleetPose(position: WorldPoint, headingRadians: number, speed: number): LocalSpaceSnapshot;
  /** Advance native player navigation/mining without ticking field asteroids twice. */
  tickFleetNavigation(deltaSeconds: number): LocalSpaceSnapshot;
  /** Receive native combat integrity without a second damage calculation. */
  syncCombatIntegrity(shieldHp: number, hullHp: number): LocalSpaceSnapshot;
  tickCombatEnvironment(deltaSeconds: number, fleetOwnsIntegrity?: boolean): LocalSpaceSnapshot;
  tick(deltaSeconds: number): LocalSpaceSnapshot;
}
