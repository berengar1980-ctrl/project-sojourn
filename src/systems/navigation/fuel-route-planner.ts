import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';
import {
  planRouteFromPoint,
  planRouteWithProfile,
  type RoutePlan,
  type RouteProfile,
} from './route-planner';

const FUEL_RESERVE = 1.02;
const FUEL_PRICE = 10;
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
  readonly fuel: number;
  readonly capacity: number;
  readonly credits: number;
  readonly fuelPerDistance: number;
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

export function canFuelAt(location: WorldLocation | undefined): boolean {
  if (!location) return false;
  if (!['planet', 'moon', 'station'].includes(location.kind)) return false;
  const facilities = location.activities;
  return Boolean(facilities.refuel || facilities.dock || facilities.trade || facilities.shipyard);
}

function purchaseFuel(fuel: number, capacity: number, credits: number) {
  const missing = Math.max(0, Math.ceil((capacity - fuel) * FUEL_PRICE - 1e-8));
  const cost = Math.min(missing, Math.max(0, Math.floor(credits)));
  return { fuel: Math.min(capacity, fuel + cost / FUEL_PRICE), cost };
}

function legBetween(request: FuelRouteRequest, fromId: string, toId: string): RoutePlan {
  if (fromId === 'deep-space') {
    return planRouteFromPoint(request.world, request.fromPosition, toId, request.profile);
  }
  return planRouteWithProfile(request.world, fromId, toId, request.profile);
}

function assemblePlan(request: FuelRouteRequest, state: SearchState): FuelRoutePlan {
  const legs = state.legs;
  const points = legs.flatMap((leg, index) =>
    index === 0 ? leg.route.points : leg.route.points.slice(1)
  );
  const route: RoutePlan = {
    fromId: request.fromId ?? 'deep-space',
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
      legBetween(request, request.fromId ?? 'deep-space', request.destinationId).distance *
      request.fuelPerDistance,
    route,
  };
}

function validRequest(request: FuelRouteRequest): boolean {
  const measures = [
    request.fuelPerDistance,
    request.fuel,
    request.capacity,
    request.credits,
  ];
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
  next: string
): SearchState | null {
  if (next === current.at || current.visited.includes(next)) return null;
  const segment = legBetween(request, current.at, next);
  const required = Math.max(0.1, segment.distance * request.fuelPerDistance);
  if (required * FUEL_RESERVE > current.fuel + 1e-6) return null;
  const remaining = Math.max(0, current.fuel - required);
  const bought = next === request.destinationId
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

/** Shortest fuel-feasible itinerary. Every stop must be affordable with the remaining wallet. */
export function planFuelRoute(request: FuelRouteRequest): FuelRoutePlan | null {
  if (!validRequest(request)) return null;
  const origin = request.fromId ?? 'deep-space';
  if (origin === request.destinationId) return null;
  const candidates = fuelingCandidates(request, origin);
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
  while (queue.length && explored++ < MAX_SEARCH_STATES) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift()!;
    if (current.at === request.destinationId) return assemblePlan(request, current);
    if (current.legs.length > MAX_STOPS) continue;
    for (const id of candidates) {
      const state = nextState(request, current, id);
      if (state) acceptState(state, queue, best);
    }
  }
  return null;
}
