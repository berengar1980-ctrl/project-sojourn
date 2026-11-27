import { isServicedPort as canFuelAt } from '../../core/port-service-policy';
export { isServicedPort as canFuelAt } from '../../core/port-service-policy';
import { FUEL_PRICE_PER_UNIT as FUEL_PRICE, quoteRefuel } from '../../core/fuel-pricing';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import {
  planRouteFromPoint,
  planRouteWithProfile,
  repointRouteEndpoints,
  type RoutePlan,
  type RouteProfile,
  type RouteThreatContact,
} from './route-planner';

const FUEL_RESERVE = 1.02;
const MAX_STOPS = 8;
const MAX_SEARCH_STATES = 2500;

export interface FuelRouteLeg {
  readonly destinationId: string;
  readonly route: RoutePlan;
  readonly fuelRequired: number;
  readonly refuelUnits: number;
  readonly refuelCost: number;
}

export interface FuelRoutePlan {
  readonly destinationId: string;
  readonly legs: readonly FuelRouteLeg[];
  readonly stopIds: readonly string[];
  readonly totalDistance: number;
  readonly totalFuel: number;
  readonly fuelCost: number;
  readonly arrivalFuel: number;
  readonly directFuel: number;
  readonly route: RoutePlan;
}

export interface FuelRouteRequest {
  readonly world: WorldMap;
  readonly fromId: string | null;
  readonly fromPosition: WorldPoint;
  readonly destinationId: string;
  readonly profile: RouteProfile;
  readonly threatContacts?: readonly RouteThreatContact[];
  readonly fuel: number;
  readonly capacity: number;
  readonly credits: number;
  readonly fuelPerDistance: number;
  /** Optional physical berth positions for NPC-only routing; players retain legacy routes. */
  readonly locationPosition?: (locationId: string) => WorldPoint;
}

interface SearchState {
  readonly at: string;
  readonly fuel: number;
  readonly credits: number;
  readonly distance: number;
  readonly usedFuel: number;
  readonly spent: number;
  readonly visited: readonly string[];
  readonly legs: readonly FuelRouteLeg[];
}

function purchaseFuel(fuel: number, capacity: number, credits: number) {
  const quote = quoteRefuel(fuel, capacity, credits);
  return { fuel: Math.min(capacity, fuel + quote.units), cost: quote.cost };
}

/**
 * Event-only salvage/distress destinations are not entries in world.locations.
 * After leaving one, the player's physical coordinates are the route origin.
 */
function routingOrigin(request: FuelRouteRequest): string {
  const fromId = request.fromId;
  return fromId && request.world.locations.some((location) => location.id === fromId)
    ? fromId
    : 'deep-space';
}

function legBetween(request: FuelRouteRequest, fromId: string, toId: string): RoutePlan {
  const base =
    fromId === 'deep-space'
      ? planRouteFromPoint(
          request.world,
          request.fromPosition,
          toId,
          request.profile,
          request.threatContacts
        )
      : planRouteWithProfile(request.world, fromId, toId, request.profile, request.threatContacts);
  if (!request.locationPosition) return base;
  return repointRouteEndpoints(
    base,
    fromId === 'deep-space' ? request.fromPosition : request.locationPosition(fromId),
    request.locationPosition(toId)
  );
}

type RouteLegLookup = (fromId: string, toId: string) => RoutePlan;

function assemblePlan(
  request: FuelRouteRequest,
  state: SearchState,
  routeLeg: RouteLegLookup
): FuelRoutePlan {
  const legs = state.legs;
  const points = legs.flatMap((leg, index) =>
    index === 0 ? leg.route.points : leg.route.points.slice(1)
  );
  const route: RoutePlan = {
    fromId: routingOrigin(request),
    toId: request.destinationId,
    points,
    distance: state.distance,
    dangerLevel: Math.max(...legs.map((leg) => leg.route.dangerLevel)) as 0 | 1 | 2 | 3,
    profile: request.profile,
  };
  return {
    destinationId: request.destinationId,
    legs,
    stopIds: legs.slice(0, -1).map((leg) => leg.destinationId),
    totalDistance: state.distance,
    totalFuel: state.usedFuel,
    fuelCost: state.spent,
    arrivalFuel: state.fuel,
    directFuel:
      routeLeg(routingOrigin(request), request.destinationId).distance * request.fuelPerDistance,
    route,
  };
}

function validRequest(request: FuelRouteRequest): boolean {
  const measures = [request.fuelPerDistance, request.fuel, request.capacity, request.credits];
  return (
    request.world.locations.some((location) => location.id === request.destinationId) &&
    measures.every((value) => Number.isFinite(value) && value >= 0)
  );
}

function fuelingCandidates(request: FuelRouteRequest, origin: string): string[] {
  const ids = request.world.locations
    .filter((location) => canFuelAt(location) && location.id !== origin)
    .map((location) => location.id);
  if (!ids.includes(request.destinationId)) ids.push(request.destinationId);
  return ids;
}

function nextState(
  request: FuelRouteRequest,
  current: SearchState,
  next: string,
  routeLeg: RouteLegLookup,
  minimumDistance: (fromId: string, toId: string) => number
): SearchState | null {
  if (next === current.at || current.visited.includes(next)) return null;
  // Any route is at least as long as the straight line between its actual
  // departure and arrival berths. Reject impossible fuel legs before invoking
  // the expensive hazard-aware pathfinder.
  const minimumFuel = Math.max(0.1, minimumDistance(current.at, next) * request.fuelPerDistance);
  if (minimumFuel * FUEL_RESERVE > current.fuel + 1e-6) return null;
  const segment = routeLeg(current.at, next);
  const required = Math.max(0.1, segment.distance * request.fuelPerDistance);
  if (required * FUEL_RESERVE > current.fuel + 1e-6) return null;
  const remaining = Math.max(0, current.fuel - required);
  const bought =
    next === request.destinationId
      ? { fuel: remaining, cost: 0 }
      : purchaseFuel(remaining, request.capacity, current.credits);
  const leg: FuelRouteLeg = {
    destinationId: next,
    route: segment,
    fuelRequired: required,
    refuelUnits: bought.fuel - remaining,
    refuelCost: bought.cost,
  };
  return {
    at: next,
    fuel: bought.fuel,
    credits: current.credits - bought.cost,
    distance: current.distance + segment.distance,
    usedFuel: current.usedFuel + required,
    spent: current.spent + bought.cost,
    visited: [...current.visited, next],
    legs: [...current.legs, leg],
  };
}

function dominates(first: SearchState, second: SearchState): boolean {
  return (
    first.distance <= second.distance &&
    first.fuel >= second.fuel &&
    first.credits >= second.credits
  );
}

function acceptState(
  state: SearchState,
  queue: SearchState[],
  best: Map<string, SearchState[]>
): void {
  const previous = best.get(state.at) ?? [];
  if (previous.some((entry) => dominates(entry, state))) return;
  best.set(state.at, [...previous.filter((entry) => !dominates(state, entry)), state]);
  queue.push(state);
}

function directFuelPlan(
  request: FuelRouteRequest,
  origin: string,
  routeLeg: RouteLegLookup,
  minimumDistance: (fromId: string, toId: string) => number
): FuelRoutePlan | null {
  const straightFuel = Math.max(
    0.1,
    minimumDistance(origin, request.destinationId) * request.fuelPerDistance
  );
  if (straightFuel * FUEL_RESERVE > Math.min(request.fuel, request.capacity) + 1e-6) return null;
  const route = routeLeg(origin, request.destinationId);
  const required = Math.max(0.1, route.distance * request.fuelPerDistance);
  const fuel = Math.max(0, Math.min(request.fuel, request.capacity));
  if (required * FUEL_RESERVE > fuel + 1e-6) return null;
  const next: SearchState = {
    at: request.destinationId,
    fuel: Math.max(0, fuel - required),
    credits: request.credits,
    distance: route.distance,
    usedFuel: required,
    spent: 0,
    visited: [origin, request.destinationId],
    legs: [
      {
        destinationId: request.destinationId,
        route,
        fuelRequired: required,
        refuelUnits: 0,
        refuelCost: 0,
      },
    ],
  };
  return assemblePlan(request, next, routeLeg);
}

/** A free full tank at every reachable port is an optimistic upper bound.
 * If even that graph cannot reach the destination, expensive routing cannot help. */
function hasOptimisticFuelPath(
  request: FuelRouteRequest,
  origin: string,
  candidates: readonly string[],
  minimumDistance: (fromId: string, toId: string) => number
): boolean {
  const queue = [{ at: origin, fuel: Math.min(request.fuel, request.capacity) }];
  const visited = new Set<string>([origin]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const next of candidates) {
      if (visited.has(next)) continue;
      const needed = Math.max(0.1, minimumDistance(current.at, next) * request.fuelPerDistance);
      if (needed * FUEL_RESERVE > current.fuel + 1e-6) continue;
      if (next === request.destinationId) return true;
      visited.add(next);
      // Intentionally ignores price and route detours: never reject a feasible trip.
      queue.push({ at: next, fuel: request.capacity });
    }
  }
  return false;
}

/** Shortest fuel-feasible itinerary. Every stop must be affordable with the remaining wallet. */
export function planFuelRoute(request: FuelRouteRequest): FuelRoutePlan | null {
  if (!validRequest(request)) return null;
  const origin = routingOrigin(request);
  if (origin === request.destinationId) return null;

  // One search evaluates many fuel/credit states for the same location pair.
  // Route geometry, hazards and profile are immutable for this request.
  const legCache = new Map<string, RoutePlan>();
  const routeLeg: RouteLegLookup = (fromId, toId) => {
    const key = JSON.stringify([fromId, toId]);
    const existing = legCache.get(key);
    if (existing) return existing;
    const route = legBetween(request, fromId, toId);
    legCache.set(key, route);
    return route;
  };
  const candidates = fuelingCandidates(request, origin);
  const locations = new Map(
    request.world.locations.map((location) => [location.id, location.position])
  );
  const berthPositions = new Map<string, WorldPoint>();
  const berth = (id: string): WorldPoint => {
    if (id === 'deep-space') return request.fromPosition;
    const existing = berthPositions.get(id);
    if (existing) return existing;
    const position = request.locationPosition?.(id) ?? locations.get(id);
    if (!position) throw new Error('Unknown fuel route location: ' + id);
    berthPositions.set(id, position);
    return position;
  };
  const distances = new Map<string, Map<string, number>>();
  const minimumDistance = (fromId: string, toId: string): number => {
    let row = distances.get(fromId);
    if (!row) {
      row = new Map();
      distances.set(fromId, row);
    }
    const cached = row.get(toId);
    if (cached !== undefined) return cached;
    const from = berth(fromId);
    const to = berth(toId);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    row.set(toId, distance);
    return distance;
  };
  const available = Math.min(request.fuel, request.capacity) + request.credits / FUEL_PRICE;
  const needed = minimumDistance(origin, request.destinationId) * request.fuelPerDistance;
  // Total paid fuel cannot overcome an insufficient straight-line budget.
  if (needed * FUEL_RESERVE > available + 1e-6) return null;
  // A feasible direct leg also proves optimistic reachability. If even its
  // straight-line fuel bound fails, directFuelPlan never invokes the pathfinder.
  const direct = directFuelPlan(request, origin, routeLeg, minimumDistance);
  if (direct) return direct;
  if (!hasOptimisticFuelPath(request, origin, candidates, minimumDistance)) return null;
  const queue: SearchState[] = [
    {
      at: origin,
      fuel: Math.max(0, Math.min(request.fuel, request.capacity)),
      credits: request.credits,
      distance: 0,
      usedFuel: 0,
      spent: 0,
      visited: [origin],
      legs: [],
    },
  ];
  const best = new Map<string, SearchState[]>();
  let explored = 0;
  const optimisticRemaining = (state: SearchState): number =>
    minimumDistance(state.at, request.destinationId);
  while (queue.length && explored++ < MAX_SEARCH_STATES) {
    // A*: straight-line distance is an admissible lower bound on routed distance.
    queue.sort(
      (a, b) =>
        a.distance + optimisticRemaining(a) - b.distance - optimisticRemaining(b) ||
        a.distance - b.distance
    );
    const current = queue.shift()!;
    if (current.at === request.destinationId) return assemblePlan(request, current, routeLeg);
    if (current.legs.length > MAX_STOPS) continue;
    const remainingFuel = current.fuel + current.credits / FUEL_PRICE;
    if (
      optimisticRemaining(current) * request.fuelPerDistance * FUEL_RESERVE >
      remainingFuel + 1e-6
    )
      continue;
    for (const id of candidates) {
      const state = nextState(request, current, id, routeLeg, minimumDistance);
      if (state) acceptState(state, queue, best);
    }
  }
  return null;
}
