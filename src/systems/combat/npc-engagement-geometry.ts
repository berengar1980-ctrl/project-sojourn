import type { ShipDefinition } from '../../core/ship-types';

export { distance } from '../../core/field-geometry';

export function engagementRange(first: ShipDefinition, second: ShipDefinition): number {
  return Math.max(48, (first.nominalLengthMeters + second.nominalLengthMeters) * 0.35);
}

export function pairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join(':');
}
