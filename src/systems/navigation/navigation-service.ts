import type { WorldMap, WorldPoint } from '../../core/world-types';
import { planRoute, type RoutePlan } from './route-planner';
import type { NavigationService, NavigationSnapshot } from './navigation-types';

interface TravelState {
  destinationId: string;
  route: RoutePlan;
  distanceTravelled: number;
  currentSpeed: number;
}

interface NavigationRuntimeState {
  currentLocationId: string | null;
  selectedDestinationId: string | null;
  currentPosition: WorldPoint;
  currentHeading: number;
  currentTurnRate: number;
  currentAngularThrust: number;
  travel: TravelState | null;
  cruiseSpeed: number;
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

function createSnapshot(world: WorldMap, state: NavigationRuntimeState): NavigationSnapshot {
  const previewRoute =
    !state.travel &&
    state.currentLocationId &&
    state.selectedDestinationId &&
    state.selectedDestinationId !== state.currentLocationId
      ? planRoute(world, state.currentLocationId, state.selectedDestinationId)
      : null;

  return {
    currentLocationId: state.currentLocationId,
    selectedDestinationId: state.selectedDestinationId,
    destinationId: state.travel?.destinationId ?? null,
    currentPosition: state.currentPosition,
    headingRadians: state.currentHeading,
    turnRateRadiansPerSecond: state.currentTurnRate,
    angularThrust: state.currentAngularThrust,
    lateralThrust: 0,
    isTravelling: state.travel !== null,
    progress: state.travel
      ? Math.min(1, state.travel.distanceTravelled / state.travel.route.distance)
      : 0,
    speed: state.travel?.currentSpeed ?? 0,
    previewRoute,
    activeRoute: state.travel?.route ?? null,
  };
}

function advanceTravel(state: NavigationRuntimeState, deltaSeconds: number): void {
  const travel = state.travel;
  if (!travel || deltaSeconds <= 0) return;

  const clamped = Math.min(deltaSeconds, 0.1);
  const [from, to] = travel.route.points;
  if (!from || !to) return;

  const desiredHeading = heading(from, to);
  state.currentAngularThrust = Math.max(
    -1,
    Math.min(1, angleDelta(state.currentHeading, desiredHeading) / (Math.PI / 4))
  );
  const previousHeading = state.currentHeading;
  state.currentHeading = turnToward(state.currentHeading, desiredHeading, MAX_TURN_RATE * clamped);
  state.currentTurnRate = angleDelta(previousHeading, state.currentHeading) / clamped;
  const turnRemaining = Math.abs(angleDelta(state.currentHeading, desiredHeading));
  const alignment = Math.max(0, Math.cos(turnRemaining));
  const remainingDistance = Math.max(0, travel.route.distance - travel.distanceTravelled);
  const acceleration = Math.max(12, state.cruiseSpeed * 0.72);
  const desiredSpeed = targetSpeed(remainingDistance, alignment, state.cruiseSpeed, acceleration);
  travel.currentSpeed = approachSpeed(travel.currentSpeed, desiredSpeed, acceleration, clamped);
  travel.distanceTravelled = Math.min(
    travel.route.distance,
    travel.distanceTravelled + travel.currentSpeed * clamped
  );

  const progress = travel.distanceTravelled / travel.route.distance;
  state.currentPosition = interpolate(from, to, progress);

  if (remainingDistance <= 0.5 || progress >= 1) {
    state.currentLocationId = travel.destinationId;
    state.selectedDestinationId = travel.destinationId;
    state.currentPosition = to;
    state.currentTurnRate = 0;
    state.currentAngularThrust = 0;
    state.travel = null;
  }
}

export function createNavigationService(
  world: WorldMap,
  startLocationId: string,
  initialCruiseSpeed: number
): NavigationService {
  const state: NavigationRuntimeState = {
    currentLocationId: startLocationId,
    selectedDestinationId: null,
    currentPosition: locationPosition(world, startLocationId),
    currentHeading: 0,
    currentTurnRate: 0,
    currentAngularThrust: 0,
    travel: null,
    cruiseSpeed: initialCruiseSpeed,
  };
  const snapshot = (): NavigationSnapshot => createSnapshot(world, state);

  const selectDestination = (locationId: string | null): NavigationSnapshot => {
    if (locationId !== null && !world.locations.some((location) => location.id === locationId)) {
      throw new Error('Unknown navigation destination: ' + locationId);
    }
    state.selectedDestinationId = locationId;
    return snapshot();
  };

  const setCruiseSpeed = (nextCruiseSpeed: number): NavigationSnapshot => {
    if (!Number.isFinite(nextCruiseSpeed) || nextCruiseSpeed <= 0) {
      throw new Error('Navigation cruise speed must be positive.');
    }
    state.cruiseSpeed = nextCruiseSpeed;
    return snapshot();
  };

  const startTravel = (): NavigationSnapshot => {
    if (state.travel || !state.currentLocationId || !state.selectedDestinationId) return snapshot();
    if (state.selectedDestinationId === state.currentLocationId) return snapshot();

    const route = planRoute(world, state.currentLocationId, state.selectedDestinationId);
    const [from, to] = route.points;
    if (!from || !to) return snapshot();

    state.travel = {
      destinationId: state.selectedDestinationId,
      route,
      distanceTravelled: 0,
      currentSpeed: 0,
    };
    state.currentLocationId = null;
    return snapshot();
  };

  return {
    getSnapshot: snapshot,
    selectDestination,
    startTravel,
    setCruiseSpeed,
    tick(deltaSeconds) {
      advanceTravel(state, deltaSeconds);
      return snapshot();
    },
  };
}
