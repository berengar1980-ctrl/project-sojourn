import type { SalvageLocalPhase } from '../../core/salvage-types';

export const INSPECTION_SECONDS = 2.8;
export const DISTRESS_DIAGNOSIS_SECONDS = 3;

export function salvageOperationProgress(
  phase: SalvageLocalPhase,
  elapsed: number,
  salvageSeconds: number,
  componentSeconds: number
): number | null {
  if (phase === 'inspecting') return Math.min(1, elapsed / INSPECTION_SECONDS);
  if (phase === 'diagnosing') return Math.min(1, elapsed / DISTRESS_DIAGNOSIS_SECONDS);
  if (phase === 'stripping') return Math.min(1, elapsed / salvageSeconds);
  if (phase === 'extracting-component') return Math.min(1, elapsed / componentSeconds);
  return null;
}
