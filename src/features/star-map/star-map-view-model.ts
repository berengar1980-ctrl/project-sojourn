import type {
  LocationActivities,
  LocationKind,
  WorldMap,
  WorldPoint,
} from '../../core/world-types';
import { planRoute, type RoutePlan } from '../../systems/navigation/route-planner';

export interface StarMapLocationView {
  readonly id: string;
  readonly name: string;
  readonly kind: LocationKind;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly description: string;
  readonly activities: LocationActivities;
  readonly dangerLevel: 0 | 1 | 2 | 3;
  readonly isCurrent: boolean;
  readonly isSelected: boolean;
}

export interface StarMapViewModel {
  readonly worldId: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly locations: readonly StarMapLocationView[];
  readonly regions: WorldMap['regions'];
  readonly route: RoutePlan | null;
}

export function createStarMapViewModel(
  world: WorldMap,
  currentLocationId: string,
  selectedLocationId: string | null
): StarMapViewModel {
  const route =
    selectedLocationId && selectedLocationId !== currentLocationId
      ? planRoute(world, currentLocationId, selectedLocationId)
      : null;

  return {
    worldId: world.id,
    title: world.name,
    width: world.width,
    height: world.height,
    regions: world.regions,
    route,
    locations: world.locations.map((location) => ({
      ...location,
      isCurrent: location.id === currentLocationId,
      isSelected: location.id === selectedLocationId,
    })),
  };
}
