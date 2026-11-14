import type { WorldMap, WorldPoint } from '../../core/world-types';
import type { RoutePlan } from './route-planner';
import type { NavigationRuntimeState } from './navigation-runtime-types';

/** Private runtime checkpoint; never substitute the public renderer snapshot. */
export interface NavigationCheckpoint {
  readonly version: 1;
  readonly worldId: string;
  readonly state: NavigationRuntimeState;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, min = -Infinity): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}

function point(value: unknown): value is WorldPoint {
  return object(value) && finite(value.x) && finite(value.y);
}

function route(value: unknown, world: WorldMap, pointId: string | null): value is RoutePlan {
  if (!object(value) || typeof value.fromId !== 'string' || typeof value.toId !== 'string') {
    return false;
  }
  if (
    !(world.locations.some((item) => item.id === value.toId) || value.toId === pointId) ||
    !['fast', 'balanced', 'safe'].includes(value.profile as string) ||
    ![0, 1, 2, 3].includes(value.dangerLevel as number) ||
    !Array.isArray(value.points) ||
    value.points.length < 2 ||
    value.points.length > 128 ||
    !value.points.every(point) ||
    !finite(value.distance, 0)
  ) {
    return false;
  }
  const points = value.points as WorldPoint[];
  const length = points.slice(1).reduce((total: number, next: WorldPoint, i: number) => {
    const previous = points[i]!;
    return total + Math.hypot(next.x - previous.x, next.y - previous.y);
  }, 0);
  return Math.abs(length - value.distance) <= Math.max(0.01, length * 0.000001);
}

function knownLocation(world: WorldMap, value: unknown): boolean {
  return (
    value === null ||
    (typeof value === 'string' && world.locations.some((location) => location.id === value))
  );
}

function validThreats(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 2000 &&
    value.every(
      (item: unknown) =>
        object(item) &&
        point(item.position) &&
        ['pirate', 'patrol'].includes(item.kind as string) &&
        (item.strength === undefined || finite(item.strength, 0))
    )
  );
}

function validPositionAndSettings(state: Record<string, unknown>, world: WorldMap): boolean {
  return (
    knownLocation(world, state.currentLocationId) &&
    point(state.currentPosition) &&
    ['fast', 'balanced', 'safe'].includes(state.routeProfile as string) &&
    finite(state.currentHeading) &&
    finite(state.currentTurnRate) &&
    finite(state.currentAngularThrust) &&
    finite(state.cruiseSpeed, Number.EPSILON) &&
    finite(state.turnRateMultiplier, Number.EPSILON) &&
    finite(state.threatRevision, 0) &&
    finite(state.lastReplanRevision, 0) &&
    finite(state.replanCooldown, 0) &&
    typeof state.threatSignature === 'string' &&
    validThreats(state.threats)
  );
}

function validPointDestination(value: unknown): boolean {
  return (
    value === null ||
    (object(value) && typeof value.id === 'string' && value.id.length > 0 && point(value.position))
  );
}

function validTravel(value: unknown, world: WorldMap, pointId: string | null): boolean {
  if (value === null) return true;
  return (
    object(value) &&
    typeof value.destinationId === 'string' &&
    route(value.route, world, pointId) &&
    value.route.toId === value.destinationId &&
    finite(value.distanceTravelled, 0) &&
    value.distanceTravelled <= value.route.distance &&
    finite(value.currentSpeed, 0)
  );
}

function validPursuit(value: unknown): boolean {
  return (
    value === null ||
    (object(value) &&
      typeof value.targetId === 'string' &&
      value.targetId.length > 0 &&
      point(value.targetPosition) &&
      finite(value.currentSpeed, 0))
  );
}

function validDestinations(state: Record<string, unknown>, world: WorldMap): boolean {
  const p = state.pointDestination;
  const travel = state.travel;
  const pursuit = state.pursuit;
  const pointId = object(p) && typeof p.id === 'string' ? p.id : null;
  if (!validPointDestination(p) || !validTravel(travel, world, pointId)) return false;
  if (!validPursuit(pursuit) || (travel !== null && pursuit !== null)) return false;
  if ((travel !== null || pursuit !== null) && state.currentLocationId !== null) return false;
  if (
    !knownLocation(world, state.selectedDestinationId) &&
    state.selectedDestinationId !== pointId
  ) {
    return false;
  }
  if (object(travel) && state.selectedDestinationId !== travel.destinationId) return false;
  return true;
}

function validate(candidate: unknown, world: WorldMap): NavigationRuntimeState {
  if (!object(candidate) || candidate.version !== 1 || candidate.worldId !== world.id) {
    throw new Error('Unbekannter oder falscher Navigations-Spielstand.');
  }
  const state = candidate.state;
  if (!object(state)) throw new Error('Navigationszustand fehlt.');
  if (!validPositionAndSettings(state, world) || !validDestinations(state, world)) {
    throw new Error('Beschädigter oder widersprüchlicher Navigationszustand.');
  }
  // Non-authoritative preview caches are intentionally rebuilt after loading.
  return {
    ...(state as unknown as NavigationRuntimeState),
    previewCache: null,
  };
}

export function captureNavigationCheckpoint(
  world: WorldMap,
  state: NavigationRuntimeState
): NavigationCheckpoint {
  const data = JSON.parse(JSON.stringify({ version: 1, worldId: world.id, state }));
  return { ...data, state: validate(data, world) } as NavigationCheckpoint;
}

/** Stage a fresh, independent navigation runtime without touching the live service. */
export function stageNavigationCheckpoint(
  world: WorldMap,
  checkpoint: unknown
): NavigationRuntimeState {
  const restored = validate(checkpoint, world);
  return JSON.parse(JSON.stringify(restored)) as NavigationRuntimeState;
}
