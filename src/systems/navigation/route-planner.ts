import type { WorldLocation, WorldMap, WorldPoint, WorldRegion } from '../../core/world-types';

export type RouteProfile = 'fast' | 'balanced' | 'safe';

export interface RoutePlan {
  readonly fromId: string;
  readonly toId: string;
  readonly points: readonly WorldPoint[];
  readonly distance: number;
  readonly dangerLevel: 0 | 1 | 2 | 3;
  readonly profile: RouteProfile;
}

const PROFILE_WEIGHTS: Readonly<Record<RouteProfile, readonly [number, number, number, number]>> = {
  fast: [1, 1.02, 1.08, 1.18],
  balanced: [1, 1.04, 1.22, 2.1],
  safe: [1, 1.08, 1.55, 5.2],
};

const REGION_CLEARANCE = 120;
const REGION_NODE_COUNT = 10;
const SAMPLE_STEP = 70;
const routeCache = new Map<string, RoutePlan>();

function findLocation(world: WorldMap, id: string): WorldLocation {
  const location = world.locations.find((candidate) => candidate.id === id);
  if (!location) throw new Error(`Unknown world location: ${id}`);
  return location;
}

function distanceBetween(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointDanger(world: WorldMap, point: WorldPoint): 0 | 1 | 2 | 3 {
  let danger: 0 | 1 | 2 | 3 = 0;
  for (const region of world.regions) {
    if (distanceBetween(point, region.center) <= region.radius) {
      danger = Math.max(danger, region.dangerLevel) as 0 | 1 | 2 | 3;
    }
  }
  return danger;
}

function segmentMetrics(
  world: WorldMap,
  from: WorldPoint,
  to: WorldPoint,
  profile: RouteProfile
): { readonly distance: number; readonly cost: number; readonly dangerLevel: 0 | 1 | 2 | 3 } {
  const distance = distanceBetween(from, to);
  if (distance <= 0) return { distance: 0, cost: 0, dangerLevel: pointDanger(world, from) };
  const samples = Math.max(1, Math.ceil(distance / SAMPLE_STEP));
  let cost = 0;
  let dangerLevel: 0 | 1 | 2 | 3 = 0;
  const weights = PROFILE_WEIGHTS[profile];

  for (let index = 0; index < samples; index += 1) {
    const t = (index + 0.5) / samples;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const danger = pointDanger(world, point);
    dangerLevel = Math.max(dangerLevel, danger) as 0 | 1 | 2 | 3;
    cost += (distance / samples) * weights[danger];
  }
  return { distance, cost, dangerLevel };
}

function regionNodes(world: WorldMap, region: WorldRegion): WorldPoint[] {
  const radius = region.radius + REGION_CLEARANCE;
  const points: WorldPoint[] = [];
  for (let index = 0; index < REGION_NODE_COUNT; index += 1) {
    const angle = (Math.PI * 2 * index) / REGION_NODE_COUNT;
    const point = {
      x: region.center.x + Math.cos(angle) * radius,
      y: region.center.y + Math.sin(angle) * radius,
    };
    if (point.x < 0 || point.y < 0 || point.x > world.width || point.y > world.height) continue;
    points.push(point);
  }
  return points;
}

function candidateNodes(world: WorldMap, from: WorldPoint, to: WorldPoint): readonly WorldPoint[] {
  return [from, to, ...world.regions.flatMap((region) => regionNodes(world, region))];
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
  profile: RouteProfile
): readonly WorldPoint[] {
  const nodes = candidateNodes(world, from, to);
  const distances = nodes.map(() => Number.POSITIVE_INFINITY);
  const previous: (number | null)[] = nodes.map(() => null);
  const visited = new Set<number>();
  distances[0] = 0;

  while (visited.size < nodes.length) {
    let current = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!visited.has(index) && distances[index]! < best) {
        current = index;
        best = distances[index]!;
      }
    }
    if (current < 0 || current === 1) break;
    visited.add(current);

    for (let next = 0; next < nodes.length; next += 1) {
      if (next === current || visited.has(next)) continue;
      const metrics = segmentMetrics(world, nodes[current]!, nodes[next]!, profile);
      const score = distances[current]! + metrics.cost;
      if (score < distances[next]!) {
        distances[next] = score;
        previous[next] = current;
      }
    }
  }

  return Number.isFinite(distances[1]!) ? reconstruct(nodes, previous, 1) : [from, to];
}

function createPlan(
  world: WorldMap,
  fromId: string,
  toId: string,
  from: WorldPoint,
  to: WorldPoint,
  profile: RouteProfile,
  endpointDanger: readonly [0 | 1 | 2 | 3, 0 | 1 | 2 | 3]
): RoutePlan {
  const points = routePoints(world, from, to, profile);
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

export function planRouteWithProfile(
  world: WorldMap,
  fromId: string,
  toId: string,
  profile: RouteProfile
): RoutePlan {
  const cacheKey = `${world.id}|${fromId}|${toId}|${profile}`;
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  const from = findLocation(world, fromId);
  const to = findLocation(world, toId);
  const plan = createPlan(world, fromId, toId, from.position, to.position, profile, [
    from.dangerLevel,
    to.dangerLevel,
  ]);
  routeCache.set(cacheKey, plan);
  return plan;
}

export function planRouteFromPoint(
  world: WorldMap,
  from: WorldPoint,
  toId: string,
  profile: RouteProfile = 'balanced'
): RoutePlan {
  const to = findLocation(world, toId);
  return createPlan(world, 'deep-space', toId, from, to.position, profile, [
    pointDanger(world, from),
    to.dangerLevel,
  ]);
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
