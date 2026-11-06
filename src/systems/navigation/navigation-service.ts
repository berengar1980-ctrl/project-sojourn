import type { WorldMap, WorldPoint } from '../../core/world-types';
import {
  planRoute,
  planRouteFromPoint,
  repointRouteEndpoints,
  type RoutePlan,
} from './route-planner';
import { navigationOrbitalBerth } from './orbital-berth';
import type { NavigationService, NavigationSnapshot } from './navigation-types';

interface TravelState {
  destinationId: string;
  route: RoutePlan;
  distanceTravelled: number;
  currentSpeed: number;
}

interface PursuitState {
  targetId: string;
  targetPosition: WorldPoint;
  currentSpeed: number;
}

interface NavigationRuntimeState {
  currentLocationId: string | null;
  pointDestination: { readonly id: string; readonly position: WorldPoint } | null;
  selectedDestinationId: string | null;
  currentPosition: WorldPoint;
  currentHeading: number;
  currentTurnRate: number;
  currentAngularThrust: number;
  travel: TravelState | null;
  pursuit: PursuitState | null;
  cruiseSpeed: number;
  turnRateMultiplier: number;
}

const MAX_TURN_RATE = 0.9;

function validTurnRateMultiplier(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Navigation turn rate multiplier must be positive.');
  }
  return value;
}

function locationPosition(world: WorldMap, id: string): WorldPoint {
  const location = world.locations.find((candidate) => candidate.id === id);
  if (!location) throw new Error('Unknown navigation location: ' + id);
  return navigationOrbitalBerth(world, id);
}

function interpolate(from: WorldPoint, to: WorldPoint, progress: number): WorldPoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function routePointAtDistance(route: RoutePlan, distance: number): WorldPoint {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < route.points.length; index += 1) {
    const from = route.points[index - 1]!;
    const to = route.points[index]!;
    const segmentDistance = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining <= segmentDistance || index === route.points.length - 1) {
      const progress = segmentDistance <= 0 ? 1 : Math.min(1, remaining / segmentDistance);
      return interpolate(from, to, progress);
    }
    remaining -= segmentDistance;
  }
  return route.points[route.points.length - 1] ?? route.points[0] ?? { x: 0, y: 0 };
}

function routeHeadingTarget(route: RoutePlan, distance: number): WorldPoint {
  const lookAhead = Math.min(route.distance, Math.max(0, distance) + 30);
  return routePointAtDistance(route, lookAhead);
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

function previewRoute(world: WorldMap, state: NavigationRuntimeState): RoutePlan | null {
  if (
    state.travel ||
    state.pursuit ||
    !state.selectedDestinationId ||
    state.selectedDestinationId === state.currentLocationId
  ) {
    return null;
  }
  const pointDestination =
    state.pointDestination?.id === state.selectedDestinationId ? state.pointDestination : null;
  if (pointDestination) {
    const distance = Math.hypot(
      pointDestination.position.x - state.currentPosition.x,
      pointDestination.position.y - state.currentPosition.y
    );
    return {
      fromId: state.currentLocationId ?? 'deep-space',
      toId: pointDestination.id,
      points: [{ ...state.currentPosition }, { ...pointDestination.position }],
      distance,
      dangerLevel: 0,
      profile: 'balanced',
    };
  }
  const currentIsStatic =
    state.currentLocationId !== null &&
    world.locations.some((location) => location.id === state.currentLocationId);
  return currentIsStatic
    ? repointRouteEndpoints(
        planRoute(world, state.currentLocationId!, state.selectedDestinationId),
        state.currentPosition,
        navigationOrbitalBerth(world, state.selectedDestinationId)
      )
    : repointRouteEndpoints(
        planRouteFromPoint(world, state.currentPosition, state.selectedDestinationId),
        state.currentPosition,
        navigationOrbitalBerth(world, state.selectedDestinationId)
      );
}

function createSnapshot(world: WorldMap, state: NavigationRuntimeState): NavigationSnapshot {
  return {
    currentLocationId: state.currentLocationId,
    selectedDestinationId: state.selectedDestinationId,
    destinationId: state.travel?.destinationId ?? null,
    pursuitTargetId: state.pursuit?.targetId ?? null,
    currentPosition: state.currentPosition,
    headingRadians: state.currentHeading,
    turnRateRadiansPerSecond: state.currentTurnRate,
    angularThrust: state.currentAngularThrust,
    lateralThrust: 0,
    isTravelling: state.travel !== null || state.pursuit !== null,
    isPursuing: state.pursuit !== null,
    progress: state.travel
      ? Math.min(1, state.travel.distanceTravelled / Math.max(1, state.travel.route.distance))
      : 0,
    speed: state.travel?.currentSpeed ?? state.pursuit?.currentSpeed ?? 0,
    previewRoute: previewRoute(world, state),
    activeRoute: state.travel?.route ?? null,
  };
}

function advanceTravel(state: NavigationRuntimeState, deltaSeconds: number): void {
  const travel = state.travel;
  if (!travel || deltaSeconds <= 0) return;

  const clamped = Math.min(deltaSeconds, 0.1);
  const currentRoutePoint = routePointAtDistance(travel.route, travel.distanceTravelled);
  const headingTarget = routeHeadingTarget(travel.route, travel.distanceTravelled);
  const to = travel.route.points[travel.route.points.length - 1];
  if (!to) return;

  const desiredHeading = heading(currentRoutePoint, headingTarget);
  state.currentAngularThrust = Math.max(
    -1,
    Math.min(1, angleDelta(state.currentHeading, desiredHeading) / (Math.PI / 4))
  );
  const previousHeading = state.currentHeading;
  state.currentHeading = turnToward(
    state.currentHeading,
    desiredHeading,
    MAX_TURN_RATE * state.turnRateMultiplier * clamped
  );
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

  const progress = travel.distanceTravelled / Math.max(1, travel.route.distance);
  state.currentPosition = routePointAtDistance(travel.route, travel.distanceTravelled);

  if (remainingDistance <= 0.5 || progress >= 1) {
    state.currentLocationId = travel.destinationId;
    state.selectedDestinationId = travel.destinationId;
    state.currentPosition = to;
    state.currentTurnRate = 0;
    state.currentAngularThrust = 0;
    state.travel = null;
    state.pointDestination = null;
  }
}

function advancePursuit(state: NavigationRuntimeState, deltaSeconds: number): void {
  const pursuit = state.pursuit;
  if (!pursuit || deltaSeconds <= 0) return;

  const clamped = Math.min(deltaSeconds, 0.1);
  const desiredHeading = heading(state.currentPosition, pursuit.targetPosition);
  const previousHeading = state.currentHeading;
  state.currentAngularThrust = Math.max(
    -1,
    Math.min(1, angleDelta(state.currentHeading, desiredHeading) / (Math.PI / 4))
  );
  state.currentHeading = turnToward(
    state.currentHeading,
    desiredHeading,
    MAX_TURN_RATE * state.turnRateMultiplier * clamped
  );
  state.currentTurnRate = angleDelta(previousHeading, state.currentHeading) / clamped;

  const turnRemaining = Math.abs(angleDelta(state.currentHeading, desiredHeading));
  const alignment = Math.max(0.2, Math.cos(turnRemaining));
  const acceleration = Math.max(12, state.cruiseSpeed * 0.72);
  const desiredSpeed = state.cruiseSpeed * alignment;
  pursuit.currentSpeed = approachSpeed(pursuit.currentSpeed, desiredSpeed, acceleration, clamped);

  state.currentPosition = {
    x: state.currentPosition.x + Math.cos(state.currentHeading) * pursuit.currentSpeed * clamped,
    y: state.currentPosition.y + Math.sin(state.currentHeading) * pursuit.currentSpeed * clamped,
  };
}

function startSelectedTravel(world: WorldMap, state: NavigationRuntimeState): void {
  const destinationId = state.selectedDestinationId;
  if (!destinationId) return;
  const route = previewRoute(world, state);
  if (!route || !route.points[route.points.length - 1]) return;

  state.travel = {
    destinationId,
    route,
    distanceTravelled: 0,
    currentSpeed: 0,
  };
  state.currentLocationId = null;
}

function startNavigationPursuit(
  state: NavigationRuntimeState,
  targetId: string,
  targetPosition: WorldPoint
): void {
  if (!targetId) return;
  const currentSpeed = state.travel?.currentSpeed ?? state.pursuit?.currentSpeed ?? 0;
  state.travel = null;
  state.pursuit = {
    targetId,
    targetPosition: { ...targetPosition },
    currentSpeed,
  };
  state.currentLocationId = null;
  state.selectedDestinationId = null;
  state.pointDestination = null;
}

function pruneMissingDestinations(state: NavigationRuntimeState, world: WorldMap): void {
  const exists = (id: string | null) =>
    id !== null && world.locations.some((location) => location.id === id);
  if (state.travel && !exists(state.travel.destinationId)) {
    state.travel = null;
    state.currentTurnRate = 0;
    state.currentAngularThrust = 0;
  }
  if (state.pointDestination === null && !exists(state.selectedDestinationId)) {
    state.selectedDestinationId = null;
  }
  if (state.currentLocationId && !exists(state.currentLocationId)) {
    state.currentLocationId = null;
  }
}

function recoverNavigationToDock(world: WorldMap, state: NavigationRuntimeState): void {
  const destination = world.locations
    .filter(
      (location) =>
        location.activities.shipyard || location.activities.dock || location.activities.refuel
    )
    .map((location) => ({
      location,
      priority: location.activities.shipyard ? 0 : location.activities.dock ? 1 : 2,
      distance: Math.hypot(
        location.position.x - state.currentPosition.x,
        location.position.y - state.currentPosition.y
      ),
    }))
    .sort(
      (first, second) => first.priority - second.priority || first.distance - second.distance
    )[0]?.location;
  if (!destination) return;
  state.travel = null;
  state.pursuit = null;
  state.currentLocationId = destination.id;
  state.selectedDestinationId = destination.id;
  state.pointDestination = null;
  state.currentPosition = navigationOrbitalBerth(world, destination.id);
  state.currentHeading = 0;
  state.currentTurnRate = 0;
  state.currentAngularThrust = 0;
}

function moveNavigationToWorld(
  state: NavigationRuntimeState,
  world: WorldMap,
  locationId: string
): boolean {
  const location = world.locations.find((item) => item.id === locationId);
  if (!location) return false;
  state.travel = null;
  state.pursuit = null;
  state.pointDestination = null;
  state.currentLocationId = locationId;
  state.selectedDestinationId = locationId;
  state.currentPosition = navigationOrbitalBerth(world, locationId);
  state.currentHeading = 0;
  state.currentTurnRate = 0;
  state.currentAngularThrust = 0;
  return true;
}

export function createNavigationService(
  world: WorldMap,
  startLocationId: string,
  initialCruiseSpeed: number
): NavigationService {
  let currentWorld = world;
  const state: NavigationRuntimeState = {
    currentLocationId: startLocationId,
    pointDestination: null,
    selectedDestinationId: null,
    currentPosition: locationPosition(world, startLocationId),
    currentHeading: 0,
    currentTurnRate: 0,
    currentAngularThrust: 0,
    travel: null,
    pursuit: null,
    cruiseSpeed: initialCruiseSpeed,
    turnRateMultiplier: 1,
  };
  const snapshot = (): NavigationSnapshot => createSnapshot(currentWorld, state);

  const selectDestination = (locationId: string | null): NavigationSnapshot => {
    if (
      locationId !== null &&
      !currentWorld.locations.some((location) => location.id === locationId)
    ) {
      throw new Error('Unknown navigation destination: ' + locationId);
    }
    state.selectedDestinationId = locationId;
    state.pointDestination = null;
    return snapshot();
  };

  const selectPointDestination = (id: string, position: WorldPoint): NavigationSnapshot => {
    state.selectedDestinationId = id;
    state.pointDestination = { id, position: { ...position } };
    return snapshot();
  };

  const setCruiseSpeed = (nextCruiseSpeed: number, turnRateMultiplier = 1): NavigationSnapshot => {
    if (!Number.isFinite(nextCruiseSpeed) || nextCruiseSpeed <= 0)
      throw new Error('Navigation cruise speed must be positive.');
    state.cruiseSpeed = nextCruiseSpeed;
    state.turnRateMultiplier = validTurnRateMultiplier(turnRateMultiplier);
    return snapshot();
  };

  const startTravel = (): NavigationSnapshot => {
    startSelectedTravel(currentWorld, state);
    return snapshot();
  };

  const startPursuit = (targetId: string, targetPosition: WorldPoint): NavigationSnapshot => {
    startNavigationPursuit(state, targetId, targetPosition);
    return snapshot();
  };

  return {
    getSnapshot: snapshot,
    replaceWorld(nextWorld) {
      currentWorld = nextWorld;
      pruneMissingDestinations(state, nextWorld);
    },
    setWorld(nextWorld, locationId) {
      if (!moveNavigationToWorld(state, nextWorld, locationId)) return false;
      currentWorld = nextWorld;
      return true;
    },
    selectDestination,
    selectPointDestination,
    startTravel,
    startPursuit,
    updatePursuitTarget(targetPosition) {
      if (state.pursuit) state.pursuit.targetPosition = { ...targetPosition };
      return snapshot();
    },
    stopPursuit() {
      state.pursuit = null;
      state.currentTurnRate = 0;
      state.currentAngularThrust = 0;
      return snapshot();
    },
    recoverToNearestDock() {
      recoverNavigationToDock(currentWorld, state);
      return snapshot();
    },
    setCruiseSpeed,
    tick(deltaSeconds) {
      if (state.pursuit) advancePursuit(state, deltaSeconds);
      else advanceTravel(state, deltaSeconds);
      return snapshot();
    },
  };
}
