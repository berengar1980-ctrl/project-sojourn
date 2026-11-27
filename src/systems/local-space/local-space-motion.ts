import { distance } from '../../core/field-geometry';
import { wrapAngle } from '../../core/numeric-geometry';
import type { WorldPoint } from '../../core/world-types';

export { distance } from '../../core/field-geometry';

export function heading(a: WorldPoint, b: WorldPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function angleDelta(current: number, target: number): number {
  return wrapAngle(target - current);
}

export function turnToward(current: number, target: number, maximumDelta: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

export function moveToward(
  current: WorldPoint,
  target: WorldPoint,
  maximumDistance: number
): WorldPoint {
  const total = distance(current, target);
  if (total <= maximumDistance || total === 0) return { ...target };

  const ratio = maximumDistance / total;
  return {
    x: current.x + (target.x - current.x) * ratio,
    y: current.y + (target.y - current.y) * ratio,
  };
}
