import type { WorldPoint } from '../../core/world-types';
import type { RoutePlan } from './route-planner';

export interface NavigationSnapshot {
  readonly currentLocationId: string | null;
  readonly selectedDestinationId: string | null;
  readonly destinationId: string | null;
  readonly currentPosition: WorldPoint;
  readonly headingRadians: number;
  readonly turnRateRadiansPerSecond: number;
  readonly lateralThrust: number;
  readonly isTravelling: boolean;
  readonly progress: number;
  readonly speed: number;
  readonly previewRoute: RoutePlan | null;
  readonly activeRoute: RoutePlan | null;
}

export interface NavigationService {
  getSnapshot(): NavigationSnapshot;
  selectDestination(locationId: string | null): NavigationSnapshot;
  startTravel(): NavigationSnapshot;
  tick(deltaSeconds: number): NavigationSnapshot;
}
