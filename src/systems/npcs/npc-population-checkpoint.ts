/** The NPC insurance fund is authoritative currency, not a derived UI counter. */
export interface NpcPopulationCheckpoint {
  readonly version: 1;
  readonly fundCredits: number;
  readonly replacementCount: number;
}

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Validate before creating any services; never partially apply a damaged checkpoint. */
export function stageNpcPopulationCheckpoint(candidate: unknown): NpcPopulationCheckpoint {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Ungültiger NPC-Populationsspielstand.');
  }
  const record = candidate as Record<string, unknown>;
  if (
    record.version !== 1 ||
    !validCount(record.fundCredits) ||
    !validCount(record.replacementCount) ||
    Object.keys(record).some((key) => !['version', 'fundCredits', 'replacementCount'].includes(key))
  ) {
    throw new Error('Beschädigter NPC-Populationsspielstand.');
  }
  return {
    version: 1,
    fundCredits: record.fundCredits,
    replacementCount: record.replacementCount,
  };
}
