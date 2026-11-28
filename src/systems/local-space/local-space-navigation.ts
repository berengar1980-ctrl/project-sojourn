import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { distance, squaredDistance } from '../../core/field-geometry';
import { localAsteroidContactRadius } from './local-asteroid-footprint';
import { fastFlankRoute, routeSegmentClear, type RouteObstacle } from './local-space-route-flanks';
export { planFlankWaypoint, routeSegmentClear } from './local-space-route-flanks';
export { fastFlankRoute } from './local-space-route-flanks';
export type { RouteObstacle } from './local-space-route-flanks';

/** The point-route planner needs geometry, not a simulated asteroid body. */
interface GridNode extends WorldPoint {
  readonly column: number;
  readonly row: number;
}

interface RouteCandidate {
  readonly points: readonly WorldPoint[];
  readonly cost: number;
}

export interface RoutePlanningOptions {
  readonly surfaceDistance?: number;
  readonly start: WorldPoint;
  readonly target: LocalAsteroid;
  readonly asteroids: readonly RouteObstacle[];
  readonly clearance: number;
  readonly width: number;
  readonly height: number;
}

export interface PointRoutePlanningOptions {
  readonly start: WorldPoint;
  readonly target: WorldPoint;
  readonly asteroids: readonly RouteObstacle[];
  readonly clearance: number;
  readonly width: number;
  readonly height: number;
  /** Project moving field bodies by their real velocity before planning. */
  readonly predictionSeconds?: number;
  /** Work approaches prefer the precise legacy grid; combat uses PvP flank-first search. */
  readonly searchOrder?: 'flank-first' | 'grid-first';
  /** Permit one safe departure segment when the current position is inside the route margin. */
  readonly startRecoveryClearance?: number;
}

export interface PointRoutePlan {
  readonly route: readonly WorldPoint[];
  readonly compromised: boolean;
}

interface QueueEntry {
  readonly key: string;
  readonly priority: number;
}

class MinPriorityQueue {
  private readonly entries: QueueEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(entry: QueueEntry): void {
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent]!.priority <= entry.priority) break;
      this.entries[index] = this.entries[parent]!;
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop(): QueueEntry | null {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!first || !last) return first ?? null;
    if (this.entries.length === 0) return first;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.entries.length) break;
      const smaller =
        right < this.entries.length && this.entries[right]!.priority < this.entries[left]!.priority
          ? right
          : left;
      if (this.entries[smaller]!.priority >= last.priority) break;
      this.entries[index] = this.entries[smaller]!;
      index = smaller;
    }
    this.entries[index] = last;
    return first;
  }
}

const GRID_SIZE = 44;
const APPROACH_SAMPLES = 16;
const CORNER_RADIUS = 34;
const MAX_ROUTE_CANDIDATES = 4;

function key(column: number, row: number): string {
  return column + ':' + row;
}

function obstacleList(
  asteroids: readonly RouteObstacle[],
  targetId: string
): readonly RouteObstacle[] {
  return asteroids.filter((asteroid) => asteroid.id !== targetId && asteroid.routeBlocking);
}

function pointClear(
  point: WorldPoint,
  obstacles: readonly RouteObstacle[],
  clearance: number
): boolean {
  return obstacles.every((asteroid) => {
    const radius = localAsteroidContactRadius(asteroid) + clearance;
    return squaredDistance(point, asteroid.position) >= radius * radius;
  });
}

function predictedObstacles(
  obstacles: readonly RouteObstacle[],
  seconds: number
): readonly RouteObstacle[] {
  if (!(seconds > 0)) return obstacles;
  return obstacles.map((obstacle) =>
    obstacle.velocity
      ? {
          ...obstacle,
          position: {
            x: obstacle.position.x + obstacle.velocity.x * seconds,
            y: obstacle.position.y + obstacle.velocity.y * seconds,
          },
        }
      : obstacle
  );
}

function gridNode(column: number, row: number): GridNode {
  return {
    column,
    row,
    x: column * GRID_SIZE + GRID_SIZE / 2,
    y: row * GRID_SIZE + GRID_SIZE / 2,
  };
}

function closestGridNode(point: WorldPoint, columns: number, rows: number): GridNode {
  const column = Math.max(0, Math.min(columns - 1, Math.floor(point.x / GRID_SIZE)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(point.y / GRID_SIZE)));
  return gridNode(column, row);
}

function neighbors(node: GridNode, columns: number, rows: number): readonly GridNode[] {
  const result: GridNode[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (columnOffset === 0 && rowOffset === 0) continue;
      const column = node.column + columnOffset;
      const row = node.row + rowOffset;
      if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
      result.push(gridNode(column, row));
    }
  }

  return result;
}

function reconstructRoute(
  cameFrom: ReadonlyMap<string, string>,
  nodes: ReadonlyMap<string, GridNode>,
  endKey: string
): readonly WorldPoint[] {
  const route: WorldPoint[] = [];
  let currentKey: string | undefined = endKey;

  while (currentKey) {
    const node = nodes.get(currentKey);
    if (!node) break;
    route.push({ x: node.x, y: node.y });
    currentKey = cameFrom.get(currentKey);
  }

  return route.reverse();
}

function findGridRoute(
  start: WorldPoint,
  end: WorldPoint,
  obstacles: readonly RouteObstacle[],
  clearance: number,
  width: number,
  height: number
): readonly WorldPoint[] | null {
  if (routeSegmentClear(start, end, obstacles, clearance)) return [start, end];

  const columns = Math.max(1, Math.ceil(width / GRID_SIZE));
  const rows = Math.max(1, Math.ceil(height / GRID_SIZE));
  const startNode = closestGridNode(start, columns, rows);
  const endNode = closestGridNode(end, columns, rows);
  const open = new MinPriorityQueue();
  const nodes = new Map<string, GridNode>();
  const cameFrom = new Map<string, string>();
  const cost = new Map<string, number>();
  const estimate = new Map<string, number>();
  const closed = new Set<string>();
  // Obstacles and clearance are fixed throughout this synchronous search.
  // A rejected node can be encountered from up to eight neighbors.
  const pointAvailability = new Uint8Array(columns * rows);
  const startKey = key(startNode.column, startNode.row);
  const endKey = key(endNode.column, endNode.row);
  const startEstimate = distance(startNode, endNode);

  nodes.set(startKey, startNode);
  cost.set(startKey, 0);
  estimate.set(startKey, startEstimate);
  open.push({ key: startKey, priority: startEstimate });

  while (open.size > 0) {
    const entry = open.pop();
    if (!entry || closed.has(entry.key)) continue;
    if (entry.priority > (estimate.get(entry.key) ?? Infinity)) continue;

    const current = nodes.get(entry.key);
    if (!current) continue;
    if (entry.key === endKey) {
      const middle = reconstructRoute(cameFrom, nodes, endKey);
      return [start, ...middle.slice(1, -1), end];
    }

    closed.add(entry.key);
    for (const neighbor of neighbors(current, columns, rows)) {
      const neighborKey = key(neighbor.column, neighbor.row);
      if (closed.has(neighborKey)) continue;
      const tentative = (cost.get(entry.key) ?? Infinity) + distance(current, neighbor);
      if (tentative >= (cost.get(neighborKey) ?? Infinity)) continue;
      const cell = neighbor.row * columns + neighbor.column;
      let availability = pointAvailability[cell];
      if (!availability) {
        availability = pointClear(neighbor, obstacles, clearance) ? 1 : 2;
        pointAvailability[cell] = availability;
      }
      if (availability === 2) continue;
      if (!routeSegmentClear(current, neighbor, obstacles, clearance * 0.92)) continue;

      const priority = tentative + distance(neighbor, endNode);
      cameFrom.set(neighborKey, entry.key);
      nodes.set(neighborKey, neighbor);
      cost.set(neighborKey, tentative);
      estimate.set(neighborKey, priority);
      open.push({ key: neighborKey, priority });
    }
  }

  return null;
}

function simplifyRoute(
  route: readonly WorldPoint[],
  obstacles: readonly RouteObstacle[],
  clearance: number
): readonly WorldPoint[] {
  if (route.length <= 2) return route;

  const result: WorldPoint[] = [route[0]!];
  let anchor = 0;

  while (anchor < route.length - 1) {
    let candidate = route.length - 1;
    while (
      candidate > anchor + 1 &&
      !routeSegmentClear(route[anchor]!, route[candidate]!, obstacles, clearance)
    ) {
      candidate -= 1;
    }
    result.push(route[candidate]!);
    anchor = candidate;
  }

  return result;
}

function interpolate(a: WorldPoint, b: WorldPoint, ratio: number): WorldPoint {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  };
}

function quadratic(a: WorldPoint, b: WorldPoint, c: WorldPoint, t: number): WorldPoint {
  const oneMinus = 1 - t;
  return {
    x: oneMinus * oneMinus * a.x + 2 * oneMinus * t * b.x + t * t * c.x,
    y: oneMinus * oneMinus * a.y + 2 * oneMinus * t * b.y + t * t * c.y,
  };
}

function roundRoute(route: readonly WorldPoint[]): readonly WorldPoint[] {
  if (route.length <= 2) return route;

  const result: WorldPoint[] = [route[0]!];

  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1]!;
    const corner = route[index]!;
    const next = route[index + 1]!;
    const incomingRatio = Math.min(0.42, CORNER_RADIUS / Math.max(1, distance(previous, corner)));
    const outgoingRatio = Math.min(0.42, CORNER_RADIUS / Math.max(1, distance(corner, next)));
    const entry = interpolate(corner, previous, incomingRatio);
    const exit = interpolate(corner, next, outgoingRatio);
    result.push(entry);

    for (let sample = 1; sample <= 5; sample += 1) {
      result.push(quadratic(entry, corner, exit, sample / 6));
    }
    result.push(exit);
  }

  result.push(route[route.length - 1]!);
  return result;
}

function routeSegmentsClear(
  points: readonly WorldPoint[],
  obstacles: readonly RouteObstacle[],
  clearance: number
): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (!routeSegmentClear(points[index - 1]!, points[index]!, obstacles, clearance)) return false;
  }
  return true;
}

function routeCost(points: readonly WorldPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1]!, points[index]!);
  }
  return total;
}

function approachPoints(
  start: WorldPoint,
  target: LocalAsteroid,
  miningRange: number,
  width: number,
  height: number
): readonly WorldPoint[] {
  const baseAngle = Math.atan2(start.y - target.position.y, start.x - target.position.x);
  const points: WorldPoint[] = [];

  for (let index = 0; index < APPROACH_SAMPLES; index += 1) {
    const alternating = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 === 0 ? -1 : 1);
    const angle = baseAngle + alternating * ((Math.PI * 2) / APPROACH_SAMPLES);
    const point = {
      x: target.position.x + Math.cos(angle) * miningRange,
      y: target.position.y + Math.sin(angle) * miningRange,
    };
    if (point.x > 0 && point.y > 0 && point.x < width && point.y < height) points.push(point);
  }

  return points;
}

export function planMiningApproachRoute(options: RoutePlanningOptions): readonly WorldPoint[] {
  const obstacles = obstacleList(options.asteroids, options.target.id);
  const miningRange = options.target.radius + (options.surfaceDistance ?? 120);
  const candidates: RouteCandidate[] = [];

  for (const end of approachPoints(
    options.start,
    options.target,
    miningRange,
    options.width,
    options.height
  )) {
    if (!pointClear(end, obstacles, options.clearance)) continue;
    const raw = findGridRoute(
      options.start,
      end,
      obstacles,
      options.clearance,
      options.width,
      options.height
    );
    if (!raw) continue;

    const simplified = simplifyRoute(raw, obstacles, options.clearance);
    const rounded = roundRoute(simplified);
    const route = routeSegmentsClear(rounded, obstacles, options.clearance * 0.82)
      ? rounded
      : simplified;
    candidates.push({ points: route, cost: routeCost(route) });
    if (candidates.length >= MAX_ROUTE_CANDIDATES) break;
  }

  candidates.sort((a, b) => a.cost - b.cost);
  if (candidates[0]) return candidates[0].points;

  const fallbackEnd =
    approachPoints(options.start, options.target, miningRange, options.width, options.height)[0] ??
    options.start;
  return [options.start, fallbackEnd];
}

export function planPointRoute(options: PointRoutePlanningOptions): PointRoutePlan {
  const target = {
    x: Math.max(0, Math.min(options.width, options.target.x)),
    y: Math.max(0, Math.min(options.height, options.target.y)),
  };
  const obstacles = predictedObstacles(
    options.asteroids.filter((asteroid) => asteroid.routeBlocking),
    options.predictionSeconds ?? 0
  );
  const clearances = [
    options.clearance,
    options.clearance * 0.72,
    options.clearance * 0.45,
    options.clearance * 0.2,
    0,
  ];

  for (const clearance of clearances) {
    if (!pointClear(target, obstacles, clearance)) continue;
    const fast =
      options.searchOrder === 'grid-first'
        ? null
        : fastFlankRoute(
            options.start,
            target,
            obstacles,
            clearance,
            options.width,
            options.height
          );
    const regularFastRoute = fast && routeSegmentsClear(fast, obstacles, clearance);
    const recoveryFastRoute =
      fast &&
      options.startRecoveryClearance !== undefined &&
      fast.length >= 2 &&
      !pointClear(options.start, obstacles, clearance) &&
      routeSegmentClear(fast[0]!, fast[1]!, obstacles, options.startRecoveryClearance) &&
      routeSegmentsClear(fast.slice(1), obstacles, clearance);
    if (fast && (regularFastRoute || recoveryFastRoute)) {
      return { route: fast, compromised: clearance < options.clearance * 0.99 };
    }
    const raw = findGridRoute(
      options.start,
      target,
      obstacles,
      clearance,
      options.width,
      options.height
    );
    if (!raw) continue;

    const simplified = simplifyRoute(raw, obstacles, clearance);
    const rounded = roundRoute(simplified);
    const route = routeSegmentsClear(rounded, obstacles, clearance * 0.82) ? rounded : simplified;
    return { route, compromised: clearance < options.clearance * 0.99 };
  }

  // A blocked target or disconnected field is not a license to drive straight
  // through a body. Callers can retain their current position and retry later.
  return { route: [], compromised: true };
}
