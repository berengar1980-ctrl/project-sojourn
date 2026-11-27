import type { WorldPoint } from '../../core/world-types';
import { clampedSegmentProjection } from '../../core/field-geometry';
/** Structural obstacle contract prevents a route-planner module cycle. */
export interface PatrolRouteObstacle {
  readonly id: string;
  readonly position: WorldPoint;
  readonly radius: number;
}

const patrolDirections = Array.from({ length: 8 }, (_, index) => {
  const angle = (index * Math.PI) / 4;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

function gapToSegment(point: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  const t = squared < 1 ? 0 : clampedSegmentProjection(point, a, dx, dy, squared);
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function clearPath(
  start: WorldPoint,
  end: WorldPoint,
  obstacles: readonly PatrolRouteObstacle[],
  clearance: number
): boolean {
  return obstacles.every((obstacle) => {
    const radius = obstacle.radius + clearance;
    // A pre-existing overlap may be escaped; do not strand a ship that
    // loaded next to a solid object.
    const atStart = Math.hypot(start.x - obstacle.position.x, start.y - obstacle.position.y);
    if (atStart < radius) {
      return Math.hypot(end.x - obstacle.position.x, end.y - obstacle.position.y) > atStart + 1;
    }
    return gapToSegment(obstacle.position, start, end) >= radius;
  });
}

function recoverPatrolRoute(
  start: WorldPoint,
  nodes: readonly WorldPoint[],
  parents: readonly number[],
  obstacles: readonly PatrolRouteObstacle[],
  clearance: number
): readonly WorldPoint[] {
  const route: WorldPoint[] = [];
  let cursor = 1;
  while (cursor > 0) {
    route.push(nodes[cursor]!);
    cursor = parents[cursor]!;
  }
  const result = route.reverse();
  let previous = start;
  for (const point of result) {
    if (!clearPath(previous, point, obstacles, clearance)) return [];
    previous = point;
  }
  return result;
}

/** Bounded visibility-graph routing for small patrol craft.
 * Avoids the 44m full-field five-pass A* grid and its multi-second
 * worst-case cost in dense asteroid fields.
 */
export function planFieldPatrolRoute(
  start: WorldPoint,
  destination: WorldPoint,
  obstacles: readonly PatrolRouteObstacle[],
  clearance: number
): readonly WorldPoint[] {
  if (clearPath(start, destination, obstacles, clearance)) return [destination];
  if (
    obstacles.some(
      (o) =>
        Math.hypot(destination.x - o.position.x, destination.y - o.position.y) <
        o.radius + clearance
    )
  )
    return [];

  const nearby = obstacles
    .filter((o) => gapToSegment(o.position, start, destination) < o.radius + clearance + 180)
    .sort(
      (a, b) =>
        Math.hypot(a.position.x - start.x, a.position.y - start.y) -
        Math.hypot(b.position.x - start.x, b.position.y - start.y)
    )
    .slice(0, 12);
  const nodes: WorldPoint[] = [start, destination];
  for (const obstacle of nearby) {
    const radius = (obstacle.radius + clearance) * 1.2 + 16;
    for (const direction of patrolDirections) {
      const point = {
        x: obstacle.position.x + direction.x * radius,
        y: obstacle.position.y + direction.y * radius,
      };
      if (
        obstacles.every(
          (other) =>
            Math.hypot(point.x - other.position.x, point.y - other.position.y) >=
            other.radius + clearance
        )
      )
        nodes.push(point);
    }
  }
  // Dijkstra over <=98 nodes, O(N^2) with no field-size dependence.
  const costs = nodes.map(() => Infinity);
  const parents = nodes.map(() => -1);
  const visited = new Uint8Array(nodes.length);
  costs[0] = 0;
  for (let step = 0; step < nodes.length; step += 1) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (visited[index]) continue;
      if (current < 0 || costs[index]! < costs[current]!) current = index;
    }
    if (current < 0 || !Number.isFinite(costs[current]!)) break;
    if (current === 1) {
      return recoverPatrolRoute(start, nodes, parents, obstacles, clearance);
    }
    visited[current] = 1;
    for (let index = 1; index < nodes.length; index += 1) {
      if (visited[index]) continue;
      if (!clearPath(nodes[current]!, nodes[index]!, nearby, clearance)) continue;
      const length = Math.hypot(
        nodes[current]!.x - nodes[index]!.x,
        nodes[current]!.y - nodes[index]!.y
      );
      const candidate = costs[current]! + length;
      if (candidate >= costs[index]!) continue;
      costs[index] = candidate;
      parents[index] = current;
    }
  }
  return [];
}
