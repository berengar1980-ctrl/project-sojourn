import type {
  EconomyMarketStock,
  EconomyResourceId,
  ResourceCirculationState,
} from '../../core/economy-types';

function finiteQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function cargoQuantity(
  cargo: Readonly<Record<EconomyResourceId, number>>,
  resourceId: EconomyResourceId
): number {
  return finiteQuantity(cargo[resourceId] ?? 0);
}

function marketQuantity(market: EconomyMarketStock, resourceId: EconomyResourceId): number {
  return finiteQuantity(market.stock[resourceId] ?? 0);
}

export function resourceTotal(
  state: ResourceCirculationState,
  resourceId: EconomyResourceId
): number {
  let total = finiteQuantity(state.pools[resourceId]?.reserve ?? 0);
  for (const market of state.markets) total += marketQuantity(market, resourceId);
  total += cargoQuantity(state.player.cargo, resourceId);
  for (const npc of state.npcs) total += cargoQuantity(npc.cargo, resourceId);
  return total;
}

export function initializeResourcePools(
  resourceIds: readonly EconomyResourceId[],
  state: Omit<ResourceCirculationState, 'pools'>
): ResourceCirculationState {
  const pools: ResourceCirculationState['pools'] = {};

  for (const resourceId of resourceIds) {
    let target = cargoQuantity(state.player.cargo, resourceId);
    for (const npc of state.npcs) target += cargoQuantity(npc.cargo, resourceId);
    for (const market of state.markets) target += marketQuantity(market, resourceId);

    pools[resourceId] = {
      target,
      reserve: 0,
      externalImports: 0,
      recordedLosses: 0,
    };
  }

  return { ...state, pools };
}

function weightedConsumerMarkets(
  state: ResourceCirculationState,
  resourceId: EconomyResourceId
): Array<{ market: EconomyMarketStock; weight: number }> {
  return state.markets
    .filter(
      (market) => !market.produces.has(resourceId) && marketQuantity(market, resourceId) > 0
    )
    .map((market) => ({
      market,
      weight:
        (market.needs.has(resourceId) ? 4 : 1) * Math.max(1, marketQuantity(market, resourceId)),
    }));
}

function pickWeightedConsumer(
  consumers: readonly { market: EconomyMarketStock; weight: number }[],
  random: () => number
): EconomyMarketStock {
  const total = consumers.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;

  for (const entry of consumers) {
    roll -= entry.weight;
    if (roll <= 0) return entry.market;
  }

  return consumers[0]!.market;
}

export function consumeResourceToReserve(
  state: ResourceCirculationState,
  resourceId: EconomyResourceId,
  amount: number,
  random: () => number
): number {
  const pool = state.pools[resourceId];
  if (!pool) return 0;

  let left = finiteQuantity(amount);
  let moved = 0;

  while (left > 0) {
    const consumers = weightedConsumerMarkets(state, resourceId);
    if (consumers.length === 0) break;

    const market = pickWeightedConsumer(consumers, random);
    const available = marketQuantity(market, resourceId);
    const quantity = Math.min(left, available, Math.max(1, Math.ceil(left / consumers.length)));
    market.stock[resourceId] = available - quantity;
    pool.reserve += quantity;
    moved += quantity;
    left -= quantity;
  }

  return moved;
}

export function drawResourceReserve(
  state: ResourceCirculationState,
  resourceId: EconomyResourceId,
  amount: number
): number {
  const pool = state.pools[resourceId];
  if (!pool) return 0;

  const quantity = Math.min(finiteQuantity(amount), finiteQuantity(pool.reserve));
  pool.reserve -= quantity;
  return quantity;
}

export function allocatePhysicalResource(
  state: ResourceCirculationState,
  resourceId: EconomyResourceId,
  amount: number,
  random: () => number
): number {
  const requested = finiteQuantity(amount);
  if (requested === 0) return 0;

  let allocated = drawResourceReserve(state, resourceId, requested);
  if (allocated >= requested) return allocated;

  consumeResourceToReserve(state, resourceId, requested - allocated, random);
  allocated += drawResourceReserve(state, resourceId, requested - allocated);
  return allocated;
}

export function recordResourceLoss(
  state: ResourceCirculationState,
  resourceId: EconomyResourceId,
  amount: number
): number {
  const pool = state.pools[resourceId];
  if (!pool) return 0;
  const quantity = finiteQuantity(amount);
  pool.recordedLosses += quantity;
  return quantity;
}

export function stabilizeResourcePool(
  state: ResourceCirculationState,
  resourceId: EconomyResourceId
): number {
  const pool = state.pools[resourceId];
  if (!pool || pool.target <= 0) return 0;

  const current = resourceTotal(state, resourceId);
  const deficit = Math.max(0, Math.floor(pool.target - current));
  if (deficit < Math.max(2, Math.floor(pool.target * 0.01))) return 0;

  const recovery = Math.min(
    deficit,
    Math.max(1, Math.floor(pool.target * 0.0045), Math.ceil(deficit * 0.1))
  );
  pool.reserve += recovery;
  pool.externalImports += recovery;
  return recovery;
}
