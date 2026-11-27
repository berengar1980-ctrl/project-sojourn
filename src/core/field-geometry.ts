import type { WorldPoint } from './world-types';

export function rotatePoint(point: WorldPoint, angle: number): { x: number; y: number } {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function squaredDistance(a: WorldPoint, b: WorldPoint): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  return x * x + y * y;
}

/** Caller supplies its existing short-segment denominator policy. */
export function clampedSegmentProjection(
  point: WorldPoint,
  start: WorldPoint,
  dx: number,
  dy: number,
  lengthSquared: number
): number {
  if (lengthSquared <= 0) return 0;
  return Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
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

  const projection = clampedSegmentProjection(point, start, dx, dy, lengthSquared);
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

/** Conservative circular broadphase; callers retain their own margin and narrow phase. */
export function contactCandidate(dx: number, dy: number, reach: number): boolean {
  return !(dx * dx + dy * dy > reach * reach);
}

interface CircleCandidate {
  readonly position: WorldPoint;
  readonly radius: number;
}

/** Index immutable obstacle centers for one solver call, preserving original order.
 * Requery after any positional correction; never cache moving ship candidates.
 */
export function circleCandidateQuery(
  obstacles: readonly CircleCandidate[]
): (center: WorldPoint, radius: number, from: number) => readonly number[] {
  const all = obstacles.map((_, index) => index);
  const cell = 256;
  if (obstacles.length < 32) return (_center, _radius, from) => all.slice(from);
  const bins = new Map<number, number[]>();
  let maximumRadius = 0;
  for (const [index, obstacle] of obstacles.entries()) {
    if (!Number.isFinite(obstacle.position.x) || !Number.isFinite(obstacle.radius))
      return (_center, _radius, from) => all.slice(from);
    maximumRadius = Math.max(maximumRadius, obstacle.radius);
    const key = Math.floor(obstacle.position.x / cell);
    const bucket = bins.get(key) ?? [];
    bucket.push(index);
    bins.set(key, bucket);
  }
  return (center, radius, from) => {
    const reach = radius + maximumRadius;
    const low = Math.floor((center.x - reach) / cell);
    const high = Math.floor((center.x + reach) / cell);
    if (!Number.isFinite(low) || !Number.isFinite(high) || high - low > bins.size)
      return all.slice(from);
    const candidates: number[] = [];
    for (let key = low; key <= high; key++) {
      for (const index of bins.get(key) ?? []) {
        if (index >= from) candidates.push(index);
      }
    }
    return candidates.sort((a, b) => a - b);
  };
}
