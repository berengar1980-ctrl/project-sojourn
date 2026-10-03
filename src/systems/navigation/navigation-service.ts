import type { WorldMap, WorldPoint } from '../../core/world-types';
import { planRoute, type RoutePlan } from './route-planner';
import type { NavigationService, NavigationSnapshot } from './navigation-types';

interface TravelState {
  destinationId: string;
  route: RoutePlan;
  distanceTravelled: number;
  currentSpeed: number;
}

const MAX_TURN_RATE = 0.9;

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

function angleDelta(current: number, target: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function turnToward(current: number, target: number, maximumDelta: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

function targetSpeed(
  remainingDistance: number,
  alignment: number,
  cruiseSpeed: number,
  acceleration: number
): number {
  const brakingSpeed = Math.sqrt(Math.max(0, 2 * acceleration * remainingDistance));
  return Math.min(cruiseSpeed * alignment, brakingSpeed);
}

function approachSpeed(
  current: number,
  target: number,
  acceleration: number,
  deltaSeconds: number
): number {
  const maximumChange = acceleration * deltaSeconds;
  if (Math.abs(target - current) <= maximumChange) return target;
  return current + Math.sign(target - current) * maximumChange;
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
  let currentTurnRate = 0;
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
      turnRateRadiansPerSecond: currentTurnRate,
      lateralThrust: 0,
      isTravelling: travel !== null,
      progress: travel ? Math.min(1, travel.distanceTravelled / travel.route.distance) : 0,
      speed: travel?.currentSpeed ?? 0,
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

    travel = {
      destinationId: selectedDestinationId,
      route,
      distanceTravelled: 0,
      currentSpeed: 0,
    };
    currentLocationId = null;
    return snapshot();
  };

  const tick = (deltaSeconds: number): NavigationSnapshot => {
    if (!travel || deltaSeconds <= 0) return snapshot();

    const clamped = Math.min(deltaSeconds, 0.1);
    const [from, to] = travel.route.points;
    if (!from || !to) return snapshot();

    const desiredHeading = heading(from, to);
    const previousHeading = currentHeading;
    currentHeading = turnToward(currentHeading, desiredHeading, MAX_TURN_RATE * clamped);
    currentTurnRate = angleDelta(previousHeading, currentHeading) / clamped;
    const turnRemaining = Math.abs(angleDelta(currentHeading, desiredHeading));
    const alignment = Math.max(0, Math.cos(turnRemaining));
    const remainingDistance = Math.max(0, travel.route.distance - travel.distanceTravelled);
    const acceleration = Math.max(12, cruiseSpeed * 0.72);
    const desiredSpeed = targetSpeed(remainingDistance, alignment, cruiseSpeed, acceleration);
    travel.currentSpeed = approachSpeed(travel.currentSpeed, desiredSpeed, acceleration, clamped);
    travel.distanceTravelled = Math.min(
      travel.route.distance,
      travel.distanceTravelled + travel.currentSpeed * clamped
    );

    const progress = travel.distanceTravelled / travel.route.distance;
    currentPosition = interpolate(from, to, progress);

    if (remainingDistance <= 0.5 || progress >= 1) {
      currentLocationId = travel.destinationId;
      selectedDestinationId = travel.destinationId;
      currentPosition = to;
      currentTurnRate = 0;
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
