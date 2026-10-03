import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

interface GridNode extends WorldPoint {
  readonly column: number;
  readonly row: number;
}

interface RouteCandidate {
  readonly points: readonly WorldPoint[];
  readonly cost: number;
}

interface RoutePlanningOptions {
  readonly start: WorldPoint;
  readonly target: LocalAsteroid;
  readonly asteroids: readonly LocalAsteroid[];
  readonly clearance: number;
  readonly width: number;
  readonly height: number;
}

const GRID_SIZE = 44;
const APPROACH_SAMPLES = 16;
const CORNER_RADIUS = 34;

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function key(column: number, row: number): string {
  return column + ':' + row;
}

function pointToSegmentDistance(point: WorldPoint, start: WorldPoint, end: WorldPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  return distance(point, {
    x: start.x + dx * projection,
    y: start.y + dy * projection,
  });
}

function obstacleList(
  asteroids: readonly LocalAsteroid[],
  targetId: string
): readonly LocalAsteroid[] {
  return asteroids.filter(
    (asteroid) => asteroid.id !== targetId && asteroid.routeBlocking
  );
}

function pointClear(
  point: WorldPoint,
  obstacles: readonly LocalAsteroid[],
  clearance: number
): boolean {
  return obstacles.every(
    (asteroid) => distance(point, asteroid.position) >= asteroid.radius + clearance
  );
}

function segmentClear(
  start: WorldPoint,
  end: WorldPoint,
  obstacles: readonly LocalAsteroid[],
  clearance: number
): boolean {
  return obstacles.every(
    (asteroid) =>
      pointToSegmentDistance(asteroid.position, start, end) >= asteroid.radius + clearance
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
  obstacles: readonly LocalAsteroid[],
  clearance: number,
  width: number,
  height: number
): readonly WorldPoint[] | null {
  if (segmentClear(start, end, obstacles, clearance)) return [start, end];

  const columns = Math.max(1, Math.ceil(width / GRID_SIZE));
  const rows = Math.max(1, Math.ceil(height / GRID_SIZE));
  const startNode = closestGridNode(start, columns, rows);
  const endNode = closestGridNode(end, columns, rows);
  const open = new Set<string>([key(startNode.column, startNode.row)]);
  const nodes = new Map<string, GridNode>();
  const cameFrom = new Map<string, string>();
  const cost = new Map<string, number>();
  const estimate = new Map<string, number>();
  const startKey = key(startNode.column, startNode.row);
  const endKey = key(endNode.column, endNode.row);

  nodes.set(startKey, startNode);
  cost.set(startKey, 0);
  estimate.set(startKey, distance(startNode, endNode));

  while (open.size > 0) {
    const currentKey = [...open].reduce((best, candidate) =>
      (estimate.get(candidate) ?? Infinity) < (estimate.get(best) ?? Infinity) ? candidate : best
    );
    const current = nodes.get(currentKey);
    if (!current) break;
    if (currentKey === endKey) {
      const middle = reconstructRoute(cameFrom, nodes, endKey);
      return [start, ...middle.slice(1, -1), end];
    }

    open.delete(currentKey);
    for (const neighbor of neighbors(current, columns, rows)) {
      if (!pointClear(neighbor, obstacles, clearance)) continue;
      if (!segmentClear(current, neighbor, obstacles, clearance * 0.92)) continue;

      const neighborKey = key(neighbor.column, neighbor.row);
      const tentative = (cost.get(currentKey) ?? Infinity) + distance(current, neighbor);
      if (tentative >= (cost.get(neighborKey) ?? Infinity)) continue;

      cameFrom.set(neighborKey, currentKey);
      nodes.set(neighborKey, neighbor);
      cost.set(neighborKey, tentative);
      estimate.set(neighborKey, tentative + distance(neighbor, endNode));
      open.add(neighborKey);
    }
  }

  return null;
}

function simplifyRoute(
  route: readonly WorldPoint[],
  obstacles: readonly LocalAsteroid[],
  clearance: number
): readonly WorldPoint[] {
  if (route.length <= 2) return route;

  const result: WorldPoint[] = [route[0]!];
  let anchor = 0;

  while (anchor < route.length - 1) {
    let candidate = route.length - 1;
    while (
      candidate > anchor + 1 &&
      !segmentClear(route[anchor]!, route[candidate]!, obstacles, clearance)
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
  obstacles: readonly LocalAsteroid[],
  clearance: number
): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (!segmentClear(points[index - 1]!, points[index]!, obstacles, clearance)) return false;
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
  const miningRange = options.target.radius + 120;
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
  }

  candidates.sort((a, b) => a.cost - b.cost);
  if (candidates[0]) return candidates[0].points;

  const fallbackEnd =
    approachPoints(options.start, options.target, miningRange, options.width, options.height)[0] ??
    options.start;
  return [options.start, fallbackEnd];
}
