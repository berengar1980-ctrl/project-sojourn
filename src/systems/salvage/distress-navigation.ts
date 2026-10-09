import type { WorldPoint } from '../../core/world-types';

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One circular ship collider; adds an outside waypoint whenever the direct route intersects it. */
export function routeAroundDistressShip(
  from: WorldPoint,
  target: WorldPoint,
  wreck: WorldPoint,
  clearance: number
): WorldPoint[] {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1) return [from, target];
  const factor = Math.max(0, Math.min(1,
    ((wreck.x - from.x) * dx + (wreck.y - from.y) * dy) / lengthSquared
  ));
  const closest = { x: from.x + dx * factor, y: from.y + dy * factor };
  const safeRadius = Math.max(1, clearance);
  if (factor <= 0 || factor >= 1 || distance(closest, wreck) >= safeRadius) {
    return [from, target];
  }
  const length = Math.sqrt(lengthSquared);
  const nx = -dy / length;
  const ny = dx / length;
  const cross = dx * (wreck.y - from.y) - dy * (wreck.x - from.x);
  const side = cross >= 0 ? -1 : 1;
  const waypoint = {
    x: wreck.x + nx * side * safeRadius * 1.55,
    y: wreck.y + ny * side * safeRadius * 1.55,
  };
  return [from, waypoint, target];
}
