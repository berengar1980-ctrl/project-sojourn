import type { SalvageField } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { longRangeScanRadius } from '../scanning/scanner-service';
export function advanceSalvageSurvey(
  elapsed: number | null,
  dt: number,
  field: SalvageField,
  position: WorldPoint,
  sensorModifier: number,
  crewSkill: number
): number | null {
  if (elapsed === null) return null;
  const next = elapsed + dt;
  if (next < 5) return next;
  const radius = longRangeScanRadius({ sensorModifier, crewSkill });
  for (const wreck of field.wrecks) {
    if (
      !wreck.inspected &&
      wreck.scanLevel !== 'analyzed' &&
      Math.hypot(position.x - wreck.position.x, position.y - wreck.position.y) <= radius
    )
      wreck.scanLevel = 'surveyed';
  }
  return null;
}
