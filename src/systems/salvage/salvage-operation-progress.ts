import type { SalvageLocalPhase } from '../../core/salvage-types';

export function salvageOperationProgress(
  phase: SalvageLocalPhase,
  elapsed: number,
  salvageSeconds: number,
  componentSeconds: number
): number | null {
  if (phase === 'inspecting') return Math.min(1, elapsed / 2.8);
  if (phase === 'diagnosing') return Math.min(1, elapsed / 3);
  if (phase === 'stripping') return Math.min(1, elapsed / salvageSeconds);
  if (phase === 'extracting-component') return Math.min(1, elapsed / componentSeconds);
  return null;
}
