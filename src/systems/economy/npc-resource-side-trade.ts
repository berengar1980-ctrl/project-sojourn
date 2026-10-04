import type {
  EconomyMarketState,
  EconomyResourceDefinition,
  EconomyResourceId,
  NpcEconomyState,
  NpcResourceSideTradePlan,
} from '../../core/economy-types';

export interface EconomyPoint {
  readonly x: number;
  readonly y: number;
}

export interface NpcSideTradeContext {
  readonly markets: readonly EconomyMarketState[];
  readonly resources: readonly EconomyResourceDefinition[];
  readonly positions: Readonly<Record<string, EconomyPoint>>;
}

const MAX_DETOUR_RATIO = 0.25;
const MIN_ROI = 0.06;
const MIN_PROFIT = 35;

function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function cargoUsed(npc: NpcEconomyState): number {
  return Object.values(npc.cargo).reduce((sum, value) => sum + quantity(value), 0);
}

function distance(first: EconomyPoint, second: EconomyPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function sourcePricePercentile(
  markets: readonly EconomyMarketState[],
  resourceId: EconomyResourceId,
  price: number
): number {
  const prices = markets
    .map((market) => market.entries[resourceId]?.price ?? 0)
    .filter((candidate) => candidate > 0)
    .sort((first, second) => first - second);
  if (prices.length <= 1) return 0;

  const below = prices.filter((candidate) => candidate < price).length;
  return below / (prices.length - 1);
}

export function findNpcResourceSideTrade(
  npc: NpcEconomyState,
  workLocationId: string,
  context: NpcSideTradeContext
): NpcResourceSideTradePlan | null {
  if (npc.role !== 'miner' && npc.role !== 'salvager') return null;

  const source = context.markets.find((market) => market.locationId === npc.locationId);
  const sourcePosition = context.positions[npc.locationId];
  const workPosition = context.positions[workLocationId];
  if (!source || !sourcePosition || !workPosition) return null;

  const free = Math.max(0, quantity(npc.normalCargoCapacity) - cargoUsed(npc));
  if (free <= 0 || npc.credits <= 0) return null;

  const directDistance = Math.max(1, distance(sourcePosition, workPosition));
  const allowedExtraDistance = directDistance * MAX_DETOUR_RATIO;
  let best: NpcResourceSideTradePlan | null = null;
  let bestScore = 0;

  for (const resource of context.resources) {
    if (resource.legality === 'illegal') continue;
    const buy = source.entries[resource.id];
    if (!buy || buy.stock <= 0 || buy.price <= 0) continue;
    if (sourcePricePercentile(context.markets, resource.id, buy.price) > 0.5) continue;

    const maxQuantity = Math.min(
      free,
      quantity(buy.stock),
      Math.floor(Math.max(0, npc.credits) / buy.price)
    );
    if (maxQuantity <= 0) continue;

    for (const destination of context.markets) {
      if (destination.locationId === source.locationId) continue;
      const stopPosition = context.positions[destination.locationId];
      const sell = destination.entries[resource.id];
      if (!stopPosition || !sell || sell.price <= buy.price) continue;

      const extraDistance = Math.max(
        0,
        distance(sourcePosition, stopPosition) +
          distance(stopPosition, workPosition) -
          directDistance
      );
      if (extraDistance > allowedExtraDistance) continue;

      const sellUnitPrice = Math.max(1, Math.round(sell.price * 0.94));
      const costBasis = maxQuantity * buy.price;
      const expectedProfit = maxQuantity * sellUnitPrice - costBasis;
      const roi = expectedProfit / Math.max(1, costBasis);
      if (expectedProfit < MIN_PROFIT || roi < MIN_ROI) continue;

      const detourRatio = extraDistance / directDistance;
      const score = expectedProfit / (1 + detourRatio);
      if (score <= bestScore) continue;

      bestScore = score;
      best = {
        resourceId: resource.id,
        sourceLocationId: source.locationId,
        tradeLocationId: destination.locationId,
        workLocationId,
        quantity: maxQuantity,
        costBasis,
        expectedProfit,
        extraDistance,
        allowedExtraDistance,
      };
    }
  }

  return best;
}
