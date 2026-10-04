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

interface RouteGeometry {
  readonly sourcePosition: EconomyPoint;
  readonly workPosition: EconomyPoint;
  readonly directDistance: number;
  readonly allowedExtraDistance: number;
}

interface ScoredPlan {
  readonly plan: NpcResourceSideTradePlan;
  readonly score: number;
}

function destinationCandidate(
  resource: EconomyResourceDefinition,
  source: EconomyMarketState,
  destination: EconomyMarketState,
  workLocationId: string,
  maxQuantity: number,
  geometry: RouteGeometry,
  context: NpcSideTradeContext
): ScoredPlan | null {
  if (destination.locationId === source.locationId) return null;

  const stopPosition = context.positions[destination.locationId];
  const buy = source.entries[resource.id];
  const sell = destination.entries[resource.id];
  if (!stopPosition || !buy || !sell || sell.price <= buy.price) return null;

  const extraDistance = Math.max(
    0,
    distance(geometry.sourcePosition, stopPosition) +
      distance(stopPosition, geometry.workPosition) -
      geometry.directDistance
  );
  if (extraDistance > geometry.allowedExtraDistance) return null;

  const sellUnitPrice = Math.max(1, Math.round(sell.price * 0.94));
  const costBasis = maxQuantity * buy.price;
  const expectedProfit = maxQuantity * sellUnitPrice - costBasis;
  const roi = expectedProfit / Math.max(1, costBasis);
  if (expectedProfit < MIN_PROFIT || roi < MIN_ROI) return null;

  return {
    score: expectedProfit / (1 + extraDistance / geometry.directDistance),
    plan: {
      resourceId: resource.id,
      sourceLocationId: source.locationId,
      tradeLocationId: destination.locationId,
      workLocationId,
      quantity: maxQuantity,
      costBasis,
      expectedProfit,
      extraDistance,
      allowedExtraDistance: geometry.allowedExtraDistance,
    },
  };
}

function bestResourceCandidate(
  npc: NpcEconomyState,
  resource: EconomyResourceDefinition,
  source: EconomyMarketState,
  workLocationId: string,
  free: number,
  geometry: RouteGeometry,
  context: NpcSideTradeContext
): ScoredPlan | null {
  if (resource.legality === 'illegal') return null;

  const buy = source.entries[resource.id];
  if (!buy || buy.stock <= 0 || buy.price <= 0) return null;
  if (sourcePricePercentile(context.markets, resource.id, buy.price) > 0.5) return null;

  const maxQuantity = Math.min(
    free,
    quantity(buy.stock),
    Math.floor(Math.max(0, npc.credits) / buy.price)
  );
  if (maxQuantity <= 0) return null;

  let best: ScoredPlan | null = null;
  for (const destination of context.markets) {
    const candidate = destinationCandidate(
      resource,
      source,
      destination,
      workLocationId,
      maxQuantity,
      geometry,
      context
    );
    if (candidate && (!best || candidate.score > best.score)) best = candidate;
  }
  return best;
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

  const normalCapacity = quantity(npc.normalCargoCapacity ?? npc.cargoCapacity);
  const free = Math.max(0, normalCapacity - cargoUsed(npc));
  if (free <= 0 || npc.credits <= 0) return null;

  const directDistance = Math.max(1, distance(sourcePosition, workPosition));
  const geometry: RouteGeometry = {
    sourcePosition,
    workPosition,
    directDistance,
    allowedExtraDistance: directDistance * MAX_DETOUR_RATIO,
  };

  let best: ScoredPlan | null = null;
  for (const resource of context.resources) {
    const candidate = bestResourceCandidate(
      npc,
      resource,
      source,
      workLocationId,
      free,
      geometry,
      context
    );
    if (candidate && (!best || candidate.score > best.score)) best = candidate;
  }

  return best?.plan ?? null;
}
