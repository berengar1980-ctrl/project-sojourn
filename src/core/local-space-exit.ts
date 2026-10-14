import type { WorldPoint } from './world-types';

/** One stable gate per local field; all ships enter and leave by the same corridor. */
export function seededLocalGate(width: number, height: number, seed: number): WorldPoint {
  const side = (Math.imul(seed | 0, 1103515245) >>> 0) % 4;
  const fraction = 0.2 + ((Math.imul(seed | 0, 1664525) >>> 8) % 600) / 1000;
  if (side === 0) return { x: 180, y: height * fraction };
  if (side === 1) return { x: width - 180, y: height * fraction };
  if (side === 2) return { x: width * fraction, y: 180 };
  return { x: width * fraction, y: height - 180 };
}
