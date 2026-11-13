import type { ShipDefinition } from '../../core/ship-types';

export function distance(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number }
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function engagementRange(first: ShipDefinition, second: ShipDefinition): number {
  return Math.max(48, (first.nominalLengthMeters + second.nominalLengthMeters) * 0.35);
}

export function pairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join(':');
}
