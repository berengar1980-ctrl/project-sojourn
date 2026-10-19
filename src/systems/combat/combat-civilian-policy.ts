/**
 * Shared civilian combat policy. Civilian roles determine risk tolerance, not
 * a mandatory retreat: actual mounted weapons, mines and threat determine that.
 */
export type CivilianCombatRole = 'freighter' | 'industrial';

export function civilianCombatRole(idOrJob: string): CivilianCombatRole | null {
  const label = idOrJob.toLowerCase();
  if (/freight|cargo/.test(label)) return 'freighter';
  if (/miner|mining|salvag|scaveng/.test(label)) return 'industrial';
  return null;
}

/** Initial stance is based on installed weapons and survival, never a job-only flee rule. */
export function civilianCombatOpening(
  hullRatio: number,
  aggression: number,
  hasWeapons: boolean,
  hasMines: boolean
): 'fight' | 'minefield' | 'flee' {
  if (hullRatio <= 0.3 || (!hasWeapons && !hasMines)) return 'flee';
  return hasMines && aggression < 65 ? 'minefield' : 'fight';
}

/** Threshold for fleeing: working ships are wary of military opponents. */
export function requiredCombatConfidence(
  ownId: string,
  opponentId: string,
  aggression: number
): number {
  const ours = civilianCombatRole(ownId);
  const opponent = civilianCombatRole(opponentId);
  const militaryBaseline = /patrol|cutter/i.test(ownId) ? 0.32 : 0.4;
  const baseline = ours
    ? opponent
      ? ours === 'freighter'
        ? 0.46
        : 0.4
      : ours === 'freighter'
        ? 0.7
        : 0.68
    : militaryBaseline;
  const confidence = Math.max(0.16, Math.min(0.85, baseline - (aggression - 50) * 0.0025));
  // Even cautious civilian vessels should not flee from evenly matched workers.
  return ours && opponent ? Math.min(0.48, confidence) : confidence;
}
