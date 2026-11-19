import type { WorldPoint } from '../../core/world-types';
import type { FieldRouteObstacle } from './field-ship-routing';

function gapToSegment(point: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  const t =
    squared < 1
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function clearPath(
  start: WorldPoint,
  end: WorldPoint,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number
): boolean {
  return obstacles.every((obstacle) => {
    const radius = obstacle.radius + clearance;
    // A pre-existing overlap may be escaped; do not strand a ship that
    // loaded next to a solid object.
    const atStart = Math.hypot(
      start.x - obstacle.position.x,
      start.y - obstacle.position.y
    );
    if (atStart < radius) {
      return Math.hypot(
        end.x - obstacle.position.x,
        end.y - obstacle.position.y
      ) > atStart + 1;
    }
    return gapToSegment(obstacle.position, start, end) >= radius;
  });
}

/** Bounded visibility-graph routing for small patrol craft.
 * Avoids the 44m full-field five-pass A* grid and its multi-second
 * worst-case cost in dense asteroid fields.
 */
export function planFieldPatrolRoute(
  start: WorldPoint,
  destination: WorldPoint,
  obstacles: readonly FieldRouteObstacle[],
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
    .filter(
      (o) =>
        gapToSegment(o.position, start, destination) < o.radius + clearance + 180
    )
    .sort(
      (a, b) =>
        Math.hypot(a.position.x - start.x, a.position.y - start.y) -
        Math.hypot(b.position.x - start.x, b.position.y - start.y)
    )
    .slice(0, 12);
  const nodes: WorldPoint[] = [start, destination];
  for (const obstacle of nearby) {
    const radius = obstacle.radius + clearance + 22;
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4;
      const point = {
        x: obstacle.position.x + Math.cos(angle) * radius,
        y: obstacle.position.y + Math.sin(angle) * radius,
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
  const visited = new Set<number>();
  costs[0] = 0;
  for (let step = 0; step < nodes.length; step += 1) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (visited.has(index)) continue;
      if (current < 0 || costs[index]! < costs[current]!) current = index;
    }
    if (current < 0 || !Number.isFinite(costs[current]!)) break;
    if (current === 1) {
      const route: WorldPoint[] = [];
      let cursor = 1;
      while (cursor > 0) {
        route.push(nodes[cursor]!);
        cursor = parents[cursor]!;
      }
      return route.reverse();
    }
    visited.add(current);
    for (let index = 1; index < nodes.length; index += 1) {
      if (visited.has(index)) continue;
      if (!clearPath(nodes[current]!, nodes[index]!, obstacles, clearance)) continue;
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
