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

function route(value: unknown, world: WorldMap): value is RoutePlan {
  if (!object(value) || typeof value.fromId !== 'string' || typeof value.toId !== 'string') {
    return false;
  }
  if (
    !world.locations.some((item) => item.id === value.toId) ||
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
  const length = value.points.slice(1).reduce((total: number, next: WorldPoint, i: number) => {
    const previous = value.points[i] as WorldPoint;
    return total + Math.hypot(next.x - previous.x, next.y - previous.y);
  }, 0);
  return Math.abs(length - value.distance) <= Math.max(0.01, length * 0.000001);
}

function validate(candidate: unknown, world: WorldMap): NavigationRuntimeState {
  if (!object(candidate) || candidate.version !== 1 || candidate.worldId !== world.id) {
    throw new Error('Unbekannter oder falscher Navigations-Spielstand.');
  }
  const state = candidate.state;
  if (!object(state)) throw new Error('Navigationszustand fehlt.');
  const exists = (value: unknown) =>
    value === null ||
    (typeof value === 'string' && world.locations.some((location) => location.id === value));
  const profile = ['fast', 'balanced', 'safe'].includes(state.routeProfile as string);
  const p = state.pointDestination;
  const travel = state.travel;
  const pursuit = state.pursuit;
  if (
    !exists(state.currentLocationId) ||
    !(exists(state.selectedDestinationId) || (object(p) && p.id === state.selectedDestinationId)) ||
    !point(state.currentPosition) ||
    !profile ||
    !finite(state.currentHeading) ||
    !finite(state.currentTurnRate) ||
    !finite(state.currentAngularThrust) ||
    !finite(state.cruiseSpeed, Number.EPSILON) ||
    !finite(state.turnRateMultiplier, Number.EPSILON) ||
    !finite(state.threatRevision, 0) ||
    !finite(state.lastReplanRevision, 0) ||
    !finite(state.replanCooldown, 0) ||
    !Array.isArray(state.threats) ||
    state.threats.length > 2000 ||
    !state.threats.every(
      (item: unknown) =>
        object(item) &&
        point(item.position) &&
        ['pirate', 'patrol'].includes(item.kind as string) &&
        (item.strength === undefined || finite(item.strength, 0))
    ) ||
    typeof state.threatSignature !== 'string' ||
    (p !== null && (!object(p) || typeof p.id !== 'string' || !p.id || !point(p.position))) ||
    (travel !== null &&
      (!object(travel) ||
        typeof travel.destinationId !== 'string' ||
        !route(travel.route, world) ||
        travel.route.toId !== travel.destinationId ||
        !finite(travel.distanceTravelled, 0) ||
        travel.distanceTravelled > travel.route.distance ||
        !finite(travel.currentSpeed, 0))) ||
    (pursuit !== null &&
      (!object(pursuit) ||
        typeof pursuit.targetId !== 'string' ||
        !pursuit.targetId ||
        !point(pursuit.targetPosition) ||
        !finite(pursuit.currentSpeed, 0))) ||
    (travel !== null && pursuit !== null) ||
    ((travel !== null || pursuit !== null) && state.currentLocationId !== null)
  ) {
    throw new Error('Beschädigter oder widersprüchlicher Navigationszustand.');
  }
  if (travel !== null && state.selectedDestinationId !== travel.destinationId) {
    throw new Error('Flugziel und gespeicherte Route widersprechen sich.');
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
