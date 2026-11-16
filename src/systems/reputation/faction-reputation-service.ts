export interface FactionReputationSnapshot {
  readonly scores: Readonly<Record<string, number>>;
}

export interface FactionReputationService {
  score(id: string): number | null;
  change(id: string, delta: number): boolean;
  snapshot(): FactionReputationSnapshot;
}

/** No implicit factions and no silently clamped rewards. Range: -100 to +100. */
export function createFactionReputationService(
  factionIds: readonly string[],
  checkpoint?: FactionReputationSnapshot
): FactionReputationService {
  const scores = new Map<string, number>();
  for (const id of factionIds) {
    if (!/^[a-z][a-z0-9_]*$/u.test(id) || scores.has(id)) {
      throw new Error('Invalid or duplicate faction ID: ' + id);
    }
    scores.set(id, 0);
  }
  if (checkpoint) {
    const saved = checkpoint.scores;
    if (
      !saved ||
      typeof saved !== 'object' ||
      Array.isArray(saved) ||
      Object.keys(saved).length !== scores.size
    ) {
      throw new Error('Invalid faction reputation checkpoint');
    }
    for (const id of scores.keys()) {
      const score = saved[id];
      if (!Number.isSafeInteger(score) || score < -100 || score > 100) {
        throw new Error('Invalid saved faction reputation score');
      }
      scores.set(id, score);
    }
  }
  return {
    score(id) {
      return scores.get(id) ?? null;
    },
    change(id, delta) {
      const current = scores.get(id);
      if (current === undefined || !Number.isSafeInteger(delta) || delta === 0) return false;
      const next = current + delta;
      if (next < -100 || next > 100) return false;
      scores.set(id, next);
      return true;
    },
    snapshot() {
      return { scores: Object.fromEntries(scores) };
    },
  };
}
