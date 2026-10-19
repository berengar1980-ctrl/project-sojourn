import type { CombatPoint } from './strategic-combat-types';

/** Misses stay on the sightline in 2D; depth is represented by drawing order. */
export function missedShotEnd(origin: CombatPoint, target: CombatPoint): CombatPoint {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const range = Math.hypot(dx, dy);
  const extension = 35 / Math.max(1, range);
  return { x: target.x + dx * extension, y: target.y + dy * extension };
}

export function missedShotAbove(serial: number): boolean {
  return serial % 2 === 0;
}
