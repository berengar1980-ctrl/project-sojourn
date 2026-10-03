import type { WorldMap, WorldPoint } from '../../core/world-types';
import { planRoute, type RoutePlan } from './route-planner';
import type { NavigationService, NavigationSnapshot } from './navigation-types';

interface TravelState {
  destinationId: string;
  route: RoutePlan;
  elapsedSeconds: number;
  durationSeconds: number;
}

function locationPosition(world: WorldMap, id: string): WorldPoint {
  const location = world.locations.find((candidate) => candidate.id === id);
  if (!location) throw new Error('Unknown navigation location: ' + id);
  return location.position;
}

function interpolate(from: WorldPoint, to: WorldPoint, progress: number): WorldPoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function heading(from: WorldPoint, to: WorldPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function createNavigationService(
  world: WorldMap,
  startLocationId: string,
  cruiseSpeed: number
): NavigationService {
  let currentLocationId: string | null = startLocationId;
  let selectedDestinationId: string | null = null;
  let currentPosition = locationPosition(world, startLocationId);
  let currentHeading = 0;
  let travel: TravelState | null = null;

  const snapshot = (): NavigationSnapshot => {
    const previewRoute =
      !travel &&
      currentLocationId &&
      selectedDestinationId &&
      selectedDestinationId !== currentLocationId
        ? planRoute(world, currentLocationId, selectedDestinationId)
        : null;

    return {
      currentLocationId,
      selectedDestinationId,
      destinationId: travel?.destinationId ?? null,
      currentPosition,
      headingRadians: currentHeading,
      isTravelling: travel !== null,
      progress: travel ? Math.min(1, travel.elapsedSeconds / travel.durationSeconds) : 0,
      speed: travel ? cruiseSpeed : 0,
      previewRoute,
      activeRoute: travel?.route ?? null,
    };
  };

  const selectDestination = (locationId: string | null): NavigationSnapshot => {
    if (locationId !== null && !world.locations.some((location) => location.id === locationId)) {
      throw new Error('Unknown navigation destination: ' + locationId);
    }

    selectedDestinationId = locationId;
    return snapshot();
  };

  const startTravel = (): NavigationSnapshot => {
    if (travel || !currentLocationId || !selectedDestinationId) return snapshot();
    if (selectedDestinationId === currentLocationId) return snapshot();

    const route = planRoute(world, currentLocationId, selectedDestinationId);
    const [from, to] = route.points;
    if (!from || !to) return snapshot();

    currentHeading = heading(from, to);
    travel = {
      destinationId: selectedDestinationId,
      route,
      elapsedSeconds: 0,
      durationSeconds: Math.max(0.1, route.distance / cruiseSpeed),
    };
    currentLocationId = null;
    return snapshot();
  };

  const tick = (deltaSeconds: number): NavigationSnapshot => {
    if (!travel || deltaSeconds <= 0) return snapshot();

    travel.elapsedSeconds = Math.min(
      travel.durationSeconds,
      travel.elapsedSeconds + Math.min(deltaSeconds, 0.1)
    );
    const [from, to] = travel.route.points;
    if (!from || !to) return snapshot();

    const progress = travel.elapsedSeconds / travel.durationSeconds;
    currentPosition = interpolate(from, to, progress);
    currentHeading = heading(from, to);

    if (progress >= 1) {
      currentLocationId = travel.destinationId;
      selectedDestinationId = travel.destinationId;
      currentPosition = to;
      travel = null;
    }

    return snapshot();
  };

  return {
    getSnapshot: snapshot,
    selectDestination,
    startTravel,
    tick,
  };
}
