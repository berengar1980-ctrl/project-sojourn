import type { SalvageField } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { distance } from '../local-space/local-space-motion';
import { longRangeScanRadius } from '../scanning/scanner-service';

export function advanceSalvageLongRangeScan(
  elapsed: number | null,
  delta: number,
  field: SalvageField,
  ship: WorldPoint,
  sensorModifier: number,
  crewSkill: number
): number | null {
  if (elapsed === null) return null;
  const nextElapsed = elapsed + delta;
  if (nextElapsed < 5) return nextElapsed;

  const radius = longRangeScanRadius({ sensorModifier, crewSkill });
  for (const wreck of field.wrecks) {
    if (wreck.inspected || wreck.scanLevel === 'analyzed') continue;
    if (distance(ship, wreck.position) <= radius) wreck.scanLevel = 'surveyed';
  }
  return null;
}
