import type { WorldPoint } from '../../core/world-types';

export { distance } from '../../core/field-geometry';

export function heading(a: WorldPoint, b: WorldPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
