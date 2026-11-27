import type { WorldPoint } from './world-types';

export function rotatePoint(point: WorldPoint, angle: number): { x: number; y: number } {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export function squaredDistance(a: WorldPoint, b: WorldPoint): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  return x * x + y * y;
}

export function pointToSegmentDistanceSquared(
  point: WorldPoint,
  start: WorldPoint,
  end: WorldPoint
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return squaredDistance(point, start);

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  const offsetX = point.x - (start.x + projection * dx);
  const offsetY = point.y - (start.y + projection * dy);
  return offsetX * offsetX + offsetY * offsetY;
}

/** Closest-approach warning for the existing constant-relative-velocity model. */
export function predictsClosingContact(
  dx: number,
  dy: number,
  vx: number,
  vy: number,
  warningRange: number,
  horizon: number
): boolean {
  if (Math.hypot(dx, dy) <= warningRange) return dx * vx + dy * vy < 0;
  const relativeSpeedSquared = vx * vx + vy * vy;
  if (relativeSpeedSquared < 0.001) return false;
  const time = Math.max(0, Math.min(horizon, -(dx * vx + dy * vy) / relativeSpeedSquared));
  if (time <= 0 || time >= horizon) return false;
  return Math.hypot(dx + vx * time, dy + vy * time) < warningRange;
}

/** Common contact axis; coincident centers use the existing positive-x normal. */
export function contactAxis(
  dx: number,
  dy: number
): {
  readonly distance: number;
  readonly normal: WorldPoint;
} {
  const distance = Math.hypot(dx, dy);
  const normal = distance > 0.001 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
  return { distance, normal };
}
