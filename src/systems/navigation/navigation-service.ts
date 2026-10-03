import type { WorldMap } from '../../core/world-types';
import { planRoute } from './route-planner';
import type { NavigationService, NavigationSnapshot } from './navigation-types';

export function createNavigationService(
  world: WorldMap,
  startLocationId: string
): NavigationService {
  let selectedDestinationId: string | null = null;

  const snapshot = (): NavigationSnapshot => ({
    currentLocationId: startLocationId,
    selectedDestinationId,
    currentPosition:
      world.locations.find((location) => location.id === startLocationId)?.position ?? null,
    previewRoute:
      selectedDestinationId && selectedDestinationId !== startLocationId
        ? planRoute(world, startLocationId, selectedDestinationId)
        : null,
  });

  return {
    getSnapshot: snapshot,
    selectDestination(locationId) {
      if (locationId !== null && !world.locations.some((location) => location.id === locationId)) {
        throw new Error(`Unknown navigation destination: ${locationId}`);
      }

      selectedDestinationId = locationId;
      return snapshot();
    },
    previewSelectedRoute() {
      return snapshot().previewRoute;
    },
  };
}
