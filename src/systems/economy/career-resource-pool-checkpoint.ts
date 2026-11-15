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
    pools: Object.fromEntries(Object.entries(pools).map(([id, pool]) => [id, { ...pool }])),
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
  const resourceIds = resources.map((resource) => resource.id);
  const savedIds = Object.keys(checkpoint.pools);
  if (
    new Set(resourceIds).size !== resourceIds.length ||
    savedIds.length !== resourceIds.length ||
    resourceIds.some((id) => !Object.prototype.hasOwnProperty.call(checkpoint.pools, id))
  ) {
    throw new Error('Resource pool catalog mismatch');
  }
  const pools: Record<string, EconomyResourcePool> = {};
  for (const id of resourceIds) {
    const pool = checkpoint.pools[id];
    if (
      !pool ||
      typeof pool !== 'object' ||
      Array.isArray(pool) ||
      Object.keys(pool).length !== 4 ||
      !validCount(pool.target) ||
      !validCount(pool.reserve) ||
      !validCount(pool.externalImports) ||
      !validCount(pool.recordedLosses)
    ) {
      throw new Error('Invalid resource pool values');
    }
    pools[id] = { ...pool };
  }
  return {
    pools,
    lastDay: checkpoint.lastDay,
    physicalAllocationCounter: checkpoint.physicalAllocationCounter,
  };
}
