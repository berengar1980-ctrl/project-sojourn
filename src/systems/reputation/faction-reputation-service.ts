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
  factionIds: readonly string[]
): FactionReputationService {
  const scores = new Map<string, number>();
  for (const id of factionIds) {
    if (!/^[a-z][a-z0-9_]*$/u.test(id) || scores.has(id)) {
      throw new Error('Invalid or duplicate faction ID: ' + id);
    }
    scores.set(id, 0);
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
