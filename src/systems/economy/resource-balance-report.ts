import { wholeQuantity as quantity } from '../../core/economy-quantity';
import type {
  EconomyCargoHold,
  EconomyMarketState,
  EconomyResourcePool,
  PlayerEconomyState,
} from '../../core/economy-types';

export interface ResourceBalanceReport {
  readonly resourceId: string;
  readonly target: number;
  readonly externalImports: number;
  readonly recordedLosses: number;
  readonly expectedTotal: number;
  readonly marketStock: number;
  readonly playerCargo: number;
  readonly npcCargo: number;
  readonly reserve: number;
  readonly combatBuffer: number;
  readonly asteroidStock: number;
  readonly salvageStock: number;
  readonly combatWreckStock: number;
  readonly eventWreckStock: number;
  readonly unclassifiedStock: number;
  readonly actualTotal: number;
  readonly discrepancy: number;
  readonly marketsWithResource: number;
  readonly emptyMarkets: number;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
}

function classifyStock(sourceId: string): keyof PhysicalStockBreakdown {
  if (sourceId.startsWith('combat-wreck-')) return 'combatWreckStock';
  if (sourceId.startsWith('["sector-event-field-')) return 'eventWreckStock';
  if (sourceId.startsWith('["') && sourceId.includes('","asteroid-')) return 'asteroidStock';
  if (sourceId.startsWith('["') && sourceId.includes('-salvage-')) return 'salvageStock';
  return 'unclassifiedStock';
}

type PhysicalStockBreakdown = Pick<
  ResourceBalanceReport,
  'asteroidStock' | 'salvageStock' | 'combatWreckStock' | 'eventWreckStock' | 'unclassifiedStock'
>;

function physicalBreakdown(pool: EconomyResourcePool): PhysicalStockBreakdown {
  const result = {
    asteroidStock: 0,
    salvageStock: 0,
    combatWreckStock: 0,
    eventWreckStock: 0,
    unclassifiedStock: 0,
  };
  for (const [id, amount] of Object.entries(pool.physicalStocks ?? {})) {
    result[classifyStock(id)] += quantity(amount);
  }
  return result;
}

/** Read-only material accounting; a positive discrepancy is unexplained creation. */
export function resourceBalanceReport(
  resourceId: string,
  markets: readonly EconomyMarketState[],
  player: PlayerEconomyState,
  npcs: readonly EconomyCargoHold[],
  pool: EconomyResourcePool
): ResourceBalanceReport {
  const entries = markets.flatMap((market) => {
    const entry = market.entries[resourceId];
    return entry ? [entry] : [];
  });
  const marketStock = entries.reduce((sum, entry) => sum + quantity(entry.stock), 0);
  const playerCargo = quantity(player.cargo[resourceId]?.qty ?? 0);
  const npcCargo = npcs.reduce((sum, npc) => sum + quantity(npc.cargo[resourceId] ?? 0), 0);
  const reserve = quantity(pool.reserve);
  const combatBuffer = quantity(pool.combatBuffer ?? 0);
  const physical = physicalBreakdown(pool);
  const actualTotal =
    marketStock +
    playerCargo +
    npcCargo +
    reserve +
    combatBuffer +
    Object.values(physical).reduce((sum, amount) => sum + amount, 0);
  const expectedTotal = pool.target + pool.externalImports - pool.recordedLosses;
  const prices = entries.map((entry) => entry.price);
  return {
    resourceId,
    target: pool.target,
    externalImports: pool.externalImports,
    recordedLosses: pool.recordedLosses,
    expectedTotal,
    marketStock,
    playerCargo,
    npcCargo,
    reserve,
    combatBuffer,
    ...physical,
    actualTotal,
    discrepancy: actualTotal - expectedTotal,
    marketsWithResource: entries.length,
    emptyMarkets: entries.filter((entry) => quantity(entry.stock) === 0).length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
}
