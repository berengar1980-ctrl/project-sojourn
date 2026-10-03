import type { WorldPoint } from '../../core/world-types';
import type { RoutePlan } from './route-planner';

export interface NavigationSnapshot {
  readonly currentLocationId: string;
  readonly selectedDestinationId: string | null;
  readonly currentPosition: WorldPoint | null;
  readonly previewRoute: RoutePlan | null;
}

export interface NavigationService {
  getSnapshot(): NavigationSnapshot;
  selectDestination(locationId: string | null): NavigationSnapshot;
  previewSelectedRoute(): RoutePlan | null;
}
