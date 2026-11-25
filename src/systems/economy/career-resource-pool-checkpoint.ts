import type { EconomyResourceDefinition, EconomyResourcePool } from '../../core/economy-types';

export interface CareerResourcePoolCheckpoint {
  readonly version: 1;
  readonly seed: number;
  readonly lastDay: number;
  readonly physicalAllocationCounter: number;
  readonly pools: Readonly<Record<string, Readonly<EconomyResourcePool>>>;
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function captureCareerResourcePools(
  pools: Readonly<Record<string, EconomyResourcePool>>,
  seed: number,
  lastDay: number,
  physicalAllocationCounter: number
): CareerResourcePoolCheckpoint {
  return {
    version: 1,
    seed,
    lastDay,
    physicalAllocationCounter,
    pools: Object.fromEntries(Object.entries(pools).map(([id, pool]) => [id, { ...pool, ...(pool.physicalStocks ? { physicalStocks: { ...pool.physicalStocks } } : {}) }])),
  };
}

function validateHeader(checkpoint: CareerResourcePoolCheckpoint, seed: number): void {
  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    checkpoint.seed !== seed ||
    !Number.isSafeInteger(checkpoint.lastDay) ||
    checkpoint.lastDay < -1 ||
    !validCount(checkpoint.physicalAllocationCounter) ||
    !checkpoint.pools ||
    typeof checkpoint.pools !== 'object' ||
    Array.isArray(checkpoint.pools)
  ) {
    throw new Error('Invalid resource pool checkpoint header');
  }
}

function validateCatalog(
  pools: Readonly<Record<string, Readonly<EconomyResourcePool>>>,
  resources: readonly EconomyResourceDefinition[]
): readonly string[] {
  const ids = resources.map((resource) => resource.id);
  if (
    new Set(ids).size !== ids.length ||
    Object.keys(pools).length !== ids.length ||
    ids.some((id) => !Object.prototype.hasOwnProperty.call(pools, id))
  ) {
    throw new Error('Resource pool catalog mismatch');
  }
  return ids;
}

function copyValidatedPool(pool: Readonly<EconomyResourcePool> | undefined): EconomyResourcePool {
  if (
    !pool ||
    typeof pool !== 'object' ||
    Array.isArray(pool) ||
    Object.keys(pool).some(
      (key) => !['target', 'reserve', 'externalImports', 'recordedLosses', 'combatBuffer', 'physicalStocks'].includes(key)
    ) ||
    (pool.combatBuffer !== undefined && !validCount(pool.combatBuffer)) ||
    (pool.physicalStocks !== undefined &&
      (!pool.physicalStocks ||
        typeof pool.physicalStocks !== 'object' ||
        Array.isArray(pool.physicalStocks) ||
        Object.entries(pool.physicalStocks).some(([id, amount]) => !id || !validCount(amount)))) ||
    !validCount(pool.target) ||
    !validCount(pool.reserve) ||
    !validCount(pool.externalImports) ||
    !validCount(pool.recordedLosses)
  ) {
    throw new Error('Invalid resource pool values');
  }
  return {
    target: pool.target,
    reserve: pool.reserve,
    externalImports: pool.externalImports,
    recordedLosses: pool.recordedLosses,
    ...(pool.combatBuffer !== undefined ? { combatBuffer: pool.combatBuffer } : {}),
    ...(pool.physicalStocks ? { physicalStocks: { ...pool.physicalStocks } } : {}),
  };
}

/** Prepare detached pool values before constructing any live simulation. */
export function stageCareerResourcePools(
  checkpoint: CareerResourcePoolCheckpoint,
  resources: readonly EconomyResourceDefinition[],
  seed: number
): {
  readonly pools: Record<string, EconomyResourcePool>;
  readonly lastDay: number;
  readonly physicalAllocationCounter: number;
} {
  validateHeader(checkpoint, seed);
  const ids = validateCatalog(checkpoint.pools, resources);
  const pools: Record<string, EconomyResourcePool> = {};
  for (const id of ids) pools[id] = copyValidatedPool(checkpoint.pools[id]);
  return {
    pools,
    lastDay: checkpoint.lastDay,
    physicalAllocationCounter: checkpoint.physicalAllocationCounter,
  };
}
