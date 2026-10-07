import type { WorldPoint } from '../../core/world-types';
import type { RoutePlan } from './route-planner';

export interface NavigationSnapshot {
  readonly currentLocationId: string | null;
  readonly selectedDestinationId: string | null;
  readonly destinationId: string | null;
  readonly pursuitTargetId: string | null;
  readonly currentPosition: WorldPoint;
  readonly headingRadians: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
  readonly isTravelling: boolean;
  readonly isPursuing: boolean;
  readonly progress: number;
  readonly speed: number;
  readonly previewRoute: RoutePlan | null;
  readonly activeRoute: RoutePlan | null;
}

export interface NavigationService {
  getSnapshot(): NavigationSnapshot;
  selectDestination(locationId: string | null): NavigationSnapshot;
  startTravel(): NavigationSnapshot;
  startPursuit(targetId: string, targetPosition: WorldPoint): NavigationSnapshot;
  updatePursuitTarget(targetPosition: WorldPoint): NavigationSnapshot;
  stopPursuit(): NavigationSnapshot;
  setCruiseSpeed(cruiseSpeed: number): NavigationSnapshot;
  tick(deltaSeconds: number): NavigationSnapshot;
}
