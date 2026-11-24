import type { CombatWreckVariant } from './salvage-types';

const VARIANTS: readonly CombatWreckVariant[] = [
  'fractured-freighter',
  'shattered-patrol',
  'ore-carrier',
  'split-hull',
  'salvage-barge',
];

/** Stable pseudo-random choice shared by the destruction FX and persistent salvage. */
export function combatWreckVariantFor(
  arenaSeed: number,
  shipId: string,
  elapsedSeconds: number
): CombatWreckVariant {
  const key = `${arenaSeed}|${shipId}|${Math.round(elapsedSeconds * 1000)}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return VARIANTS[(hash >>> 0) % VARIANTS.length]!;
}

/** Accept current wreck IDs and old save IDs without changing the save schema. */
export function isCombatWreckVariant(value: unknown): value is CombatWreckVariant {
  return (
    typeof value === 'string' &&
    ((VARIANTS as readonly string[]).includes(value) ||
      value === 'miner' ||
      value === 'freighter' ||
      value === 'patrol')
  );
}
