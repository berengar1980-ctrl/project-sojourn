import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';
import { measurePerformance } from '../../core/performance-diagnostics';
import { curatedZoneWaypoints, fixedDangerAtPoint } from './fixed-danger-geography';

export type RouteProfile = 'fast' | 'balanced' | 'safe';

/** Moving contacts change route exposure, never the permanent world danger bands. */
export interface RouteThreatContact {
  readonly position: WorldPoint;
  readonly kind: 'pirate' | 'patrol';
  readonly strength?: number;
}

function contactPressure(point: WorldPoint, contacts: readonly RouteThreatContact[]): number {
  let pirates = 0;
  let patrols = 0;
  for (const contact of contacts) {
    const proximity = Math.max(0, 1 - distanceBetween(point, contact.position) / 650);
    const strength = Math.max(0.25, Math.min(2, contact.strength ?? 1));
    if (contact.kind === 'pirate') pirates += proximity * proximity * strength;
    else patrols += proximity * proximity * strength;
  }
  return Math.max(0, pirates - patrols * 0.65);
}

/** Exposure is sampled along an actual route; safe and balanced profiles react differently. */
export function routeThreatExposure(
  points: readonly WorldPoint[],
  contacts: readonly RouteThreatContact[]
): number {
  if (contacts.length === 0 || points.length < 2) return 0;
  let exposure = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = distanceBetween(a, b);
    const steps = Math.max(1, Math.ceil(length / 150));
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      exposure +=
        (contactPressure({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, contacts) *
          length) /
        steps;
    }
  }
  return exposure;
}

export interface RoutePlan {
  readonly fromId: string;
  readonly toId: string;
  readonly points: readonly WorldPoint[];
  readonly distance: number;
  readonly dangerLevel: 0 | 1 | 2 | 3;
  readonly profile: RouteProfile;
}

const PROFILE_WEIGHTS: Readonly<Record<RouteProfile, readonly [number, number, number, number]>> = {
  fast: [1, 1, 1.02, 1.08],
  balanced: [0.96, 0.96, 1.08, 2.1],
  safe: [0.86, 0.86, 1.1, 5.2],
};

const SAMPLE_STEP = 115;
const MAX_STRATEGIC_WAYPOINTS = 32;
const MAX_DETOUR: Readonly<Record<RouteProfile, number>> = { fast: 1, balanced: 1.38, safe: 1.75 };
// The stable geographic network is reused across the entire multi-year NPC simulation.
const routeCache = new Map<string, RoutePlan>();
// Moving contacts have a separate, bounded cache; they must never flush static routes.
const dynamicRouteCache = new Map<string, RoutePlan>();
const MAX_DYNAMIC_ROUTES = 300;

function findLocation(world: WorldMap, id: string): WorldLocation {
  const location = world.locations.find((candidate) => candidate.id === id);
  if (!location) throw new Error(`Unknown world location: ${id}`);
  return location;
}

function distanceBetween(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function distanceToSegment(point: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 0.001) return distanceBetween(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** Only actual contacts close to the static itinerary can alter a route or invalidate its cache. */
function routeRelevantContacts(
  points: readonly WorldPoint[],
  contacts: readonly RouteThreatContact[]
): readonly RouteThreatContact[] {
  if (points.length < 2) return [];
  return contacts.filter((contact) => {
    for (let index = 1; index < points.length; index++) {
      if (distanceToSegment(contact.position, points[index - 1]!, points[index]!) <= 650)
        return true;
    }
    return false;
  });
}

function pointDanger(world: WorldMap, point: WorldPoint): 0 | 1 | 2 | 3 {
  return fixedDangerAtPoint(world.regions, point, world.defaultDangerLevel ?? 0);
}

function segmentMetrics(
  world: WorldMap,
  from: WorldPoint,
  to: WorldPoint,
  profile: RouteProfile,
  contacts: readonly RouteThreatContact[] = []
): { readonly distance: number; readonly cost: number; readonly dangerLevel: 0 | 1 | 2 | 3 } {
  const distance = distanceBetween(from, to);
  if (distance <= 0) return { distance: 0, cost: 0, dangerLevel: pointDanger(world, from) };
  const samples = Math.max(1, Math.ceil(distance / SAMPLE_STEP));
  let cost = 0;
  let dangerLevel: 0 | 1 | 2 | 3 = 0;
  const weights = PROFILE_WEIGHTS[profile];
  const relevantContacts =
    profile === 'fast'
      ? []
      : contacts.filter((contact) => distanceToSegment(contact.position, from, to) < 650);
  const threatWeight = profile === 'safe' ? 7 : profile === 'balanced' ? 2.5 : 0;

  for (let index = 0; index < samples; index += 1) {
    const t = (index + 0.5) / samples;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const danger = pointDanger(world, point);
    if (danger > dangerLevel) dangerLevel = danger;
    cost +=
      (distance / samples) *
      (weights[danger] +
        (relevantContacts.length ? contactPressure(point, relevantContacts) * threatWeight : 0));
  }
  return { distance, cost, dangerLevel };
}

function candidateNodes(
  world: WorldMap,
  from: WorldPoint,
  to: WorldPoint,
  contacts: readonly RouteThreatContact[]
): readonly WorldPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);
  const detours = contacts
    .filter((contact) => {
      if (contact.kind !== 'pirate') return false;
      const projection = Math.max(
        0,
        Math.min(
          1,
          ((contact.position.x - from.x) * dx + (contact.position.y - from.y) * dy) / lengthSquared
        )
      );
      return (
        distanceBetween(contact.position, {
          x: from.x + projection * dx,
          y: from.y + projection * dy,
        }) < 1100
      );
    })
    .slice(0, 4)
    .flatMap((contact) =>
      [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => ({
        x: contact.position.x + 740 * Math.cos(angle),
        y: contact.position.y + 740 * Math.sin(angle),
      }))
    )
    .filter(
      (point) => point.x >= 0 && point.x <= world.width && point.y >= 0 && point.y <= world.height
    );
  const strategic = world.regions
    .flatMap((region) => curatedZoneWaypoints(region))
    .filter(
      (point) => point.x >= 0 && point.y >= 0 && point.x <= world.width && point.y <= world.height
    )
    .map((point) => ({ point, proximity: distanceToSegment(point, from, to) }))
    .filter((entry) => entry.proximity <= 1550)
    .sort((a, b) => a.proximity - b.proximity)
    .slice(0, MAX_STRATEGIC_WAYPOINTS)
    .map((entry) => entry.point);
  return [from, to, ...strategic, ...detours];
}

function reconstruct(
  nodes: readonly WorldPoint[],
  previous: readonly (number | null)[],
  targetIndex: number
): WorldPoint[] {
  const indices: number[] = [];
  let current: number | null = targetIndex;
  while (current !== null) {
    indices.push(current);
    current = previous[current] ?? null;
  }
  return indices.reverse().map((index) => nodes[index]!);
}

function pathDistance(points: readonly WorldPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceBetween(points[index - 1]!, points[index]!);
  }
  return total;
}

function pathDanger(world: WorldMap, points: readonly WorldPoint[]): 0 | 1 | 2 | 3 {
  let danger: 0 | 1 | 2 | 3 = 0;
  for (let index = 1; index < points.length; index += 1) {
    danger = Math.max(
      danger,
      segmentMetrics(world, points[index - 1]!, points[index]!, 'fast').dangerLevel
    ) as 0 | 1 | 2 | 3;
  }
  return danger;
}

function routePoints(
  world: WorldMap,
  from: WorldPoint,
  to: WorldPoint,
  profile: RouteProfile,
  contacts: readonly RouteThreatContact[] = []
): readonly WorldPoint[] {
  if (profile === 'fast') return [from, to];
  const nodes = candidateNodes(world, from, to, contacts);
  const distances = nodes.map(() => Number.POSITIVE_INFINITY);
  const previous: (number | null)[] = nodes.map(() => null);
  const visited = new Uint8Array(nodes.length);
  let visitedCount = 0;
  // Every segment costs at least its straight-line length at the cheapest zone weight.
  const lowerBound = (a: WorldPoint, b: WorldPoint): number =>
    distanceBetween(a, b) * PROFILE_WEIGHTS[profile][0];
  const remainingBounds = nodes.map((node) => lowerBound(node, to));
  distances[0] = 0;
  // A valid direct path provides an initial upper bound for the optimal cost.
  distances[1] = segmentMetrics(world, from, to, profile, contacts).cost;
  previous[1] = 0;

  while (visitedCount < nodes.length) {
    let current = -1;
    let bestEstimate = Number.POSITIVE_INFINITY;
    for (let index = 0; index < nodes.length; index++) {
      if (visited[index]) continue;
      const estimate = distances[index]! + remainingBounds[index]!;
      if (estimate < bestEstimate) {
        current = index;
        bestEstimate = estimate;
      }
    }
    // A* cannot improve the best route once all remaining lower bounds reach its cost.
    if (current < 0 || current === 1 || bestEstimate >= distances[1]!) break;
    visited[current] = 1;
    visitedCount++;

    for (let next = 0; next < nodes.length; next++) {
      if (next === current || visited[next]) continue;
      const minimumScore = distances[current]! + lowerBound(nodes[current]!, nodes[next]!);
      if (minimumScore >= distances[next]!) continue;
      if (minimumScore + remainingBounds[next]! >= distances[1]!) continue;
      const metrics = segmentMetrics(world, nodes[current]!, nodes[next]!, profile, contacts);
      const score = distances[current]! + metrics.cost;
      if (score < distances[next]!) {
        distances[next] = score;
        previous[next] = current;
      }
    }
  }

  const chosen = reconstruct(nodes, previous, 1);
  // A safe course may cut through a red frontier; it must not circle half the sector.
  return pathDistance(chosen) > distanceBetween(from, to) * MAX_DETOUR[profile]
    ? [from, to]
    : chosen;
}

function createPlan(
  world: WorldMap,
  fromId: string,
  toId: string,
  from: WorldPoint,
  to: WorldPoint,
  profile: RouteProfile,
  endpointDanger: readonly [0 | 1 | 2 | 3, 0 | 1 | 2 | 3],
  contacts: readonly RouteThreatContact[] = []
): RoutePlan {
  const points = measurePerformance(
    contacts.length ? 'sim.routes.dynamic-search' : 'sim.routes.static-search',
    () => routePoints(world, from, to, profile, contacts)
  );
  return {
    fromId,
    toId,
    points,
    distance: pathDistance(points),
    dangerLevel: Math.max(endpointDanger[0], endpointDanger[1], pathDanger(world, points)) as
      0 | 1 | 2 | 3,
    profile,
  };
}

function dynamicSignature(contacts: readonly RouteThreatContact[]): string {
  return contacts
    .map(
      (contact) =>
        contact.kind +
        ':' +
        Math.round(contact.position.x / 160) +
        ':' +
        Math.round(contact.position.y / 160) +
        ':' +
        Math.round((contact.strength ?? 1) * 2)
    )
    .join(',');
}

export function planRouteWithProfile(
  world: WorldMap,
  fromId: string,
  toId: string,
  profile: RouteProfile,
  contacts: readonly RouteThreatContact[] = []
): RoutePlan {
  const cacheKey = `${world.id}|${fromId}|${toId}|${profile}`;
  const cached = routeCache.get(cacheKey);
  let base = cached;
  if (!base) {
    const from = findLocation(world, fromId);
    const to = findLocation(world, toId);
    base = createPlan(world, fromId, toId, from.position, to.position, profile, [
      from.dangerLevel,
      to.dangerLevel,
    ]);
    routeCache.set(cacheKey, base);
  }
  if (!contacts.length || profile === 'fast') return base;

  // Remote pirates must not force a costly full search or invalidate unaffected trade routes.
  const nearby = routeRelevantContacts(base.points, contacts);
  if (!nearby.length) return base;
  const liveKey = cacheKey + '|' + dynamicSignature(nearby);
  const live = dynamicRouteCache.get(liveKey);
  if (live) return live;

  const from = findLocation(world, fromId);
  const to = findLocation(world, toId);
  const plan = createPlan(
    world,
    fromId,
    toId,
    from.position,
    to.position,
    profile,
    [from.dangerLevel, to.dangerLevel],
    nearby
  );
  if (dynamicRouteCache.size >= MAX_DYNAMIC_ROUTES) dynamicRouteCache.clear();
  dynamicRouteCache.set(liveKey, plan);
  return plan;
}

export function planRouteFromPoint(
  world: WorldMap,
  from: WorldPoint,
  toId: string,
  profile: RouteProfile = 'balanced',
  contacts: readonly RouteThreatContact[] = []
): RoutePlan {
  const to = findLocation(world, toId);
  const endpointDanger: readonly [0 | 1 | 2 | 3, 0 | 1 | 2 | 3] = [
    pointDanger(world, from),
    to.dangerLevel,
  ];
  const base = createPlan(world, 'deep-space', toId, from, to.position, profile, endpointDanger);
  if (!contacts.length || profile === 'fast') return base;
  const nearby = routeRelevantContacts(base.points, contacts);
  if (!nearby.length) return base;
  return createPlan(world, 'deep-space', toId, from, to.position, profile, endpointDanger, nearby);
}

/** Retain cached sector waypoints while using real orbital departure and arrival berths. */
export function repointRouteEndpoints(
  route: RoutePlan,
  from: WorldPoint,
  to: WorldPoint
): RoutePlan {
  const points = route.points.length > 2 ? [from, ...route.points.slice(1, -1), to] : [from, to];
  return { ...route, points, distance: pathDistance(points) };
}

export function planRoute(world: WorldMap, fromId: string, toId: string): RoutePlan {
  return planRouteWithProfile(world, fromId, toId, 'balanced');
}
