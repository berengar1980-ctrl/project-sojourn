import type {
  EconomyResourceDefinition,
  EconomyResourceId,
  NpcEconomyState,
  NpcResourceSideTradePlan,
} from '../../core/economy-types';

import { npcWorkingCapital, type NpcTravelQuoteFn } from './npc-operating-decisions';
import type { SectorNpcState } from '../../core/npc-types';
import { npcMarketConfidence } from './npc-market-knowledge';

export interface EconomyPoint {
  readonly x: number;
  readonly y: number;
}

export interface NpcTradeMarketEntry {
  readonly resourceId: EconomyResourceId;
  readonly stock: number;
  readonly price: number;
}

export interface NpcTradeMarketView {
  readonly locationId: string;
  readonly observedDay?: number;
  readonly entries: Readonly<Record<EconomyResourceId, NpcTradeMarketEntry>>;
}

export interface NpcSideTradeContext {
  readonly day?: number;
  readonly quoteTravel?: NpcTravelQuoteFn;
  readonly markets: readonly NpcTradeMarketView[];
  readonly resources: readonly EconomyResourceDefinition[];
  readonly positions: Readonly<Record<string, EconomyPoint>>;
}

const MAX_DETOUR_RATIO = 0.25;
const MAX_DETOUR_DISTANCE = 600;
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
  markets: readonly NpcTradeMarketView[],
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
  readonly directDistance: number;
  readonly allowedExtraDistance: number;
  readonly stops: ReadonlyMap<string, Detour>;
}

interface Detour {
  readonly extraDistance: number;
  readonly extraExpense: number;
}

/** Quote the second leg from the planned market, conservatively with an empty tank. */
function quoteFromStop(
  npc: NpcEconomyState,
  stopId: string,
  workId: string,
  quote: NpcTravelQuoteFn
) {
  const shadow: NpcEconomyState & Partial<SectorNpcState> = { ...npc, locationId: stopId };
  delete shadow.orbit;
  delete shadow.travel;
  delete shadow.combatMovement;
  if (shadow.fuel !== undefined) shadow.fuel = 0;
  return quote(shadow, workId, npc.credits);
}

function buildRouteGeometry(
  npc: NpcEconomyState,
  workId: string,
  sourcePosition: EconomyPoint,
  workPosition: EconomyPoint,
  context: NpcSideTradeContext
): RouteGeometry | null {
  const quote = context.quoteTravel;
  const direct = quote?.(npc, workId, npc.credits);
  if (quote && !direct) return null;
  const directDistance = Math.max(1, direct?.distance ?? distance(sourcePosition, workPosition));
  const allowedExtraDistance = Math.min(MAX_DETOUR_DISTANCE, directDistance * MAX_DETOUR_RATIO);
  const stops = new Map<string, Detour>();
  for (const market of context.markets) {
    if (market.locationId === npc.locationId) continue;
    const position = context.positions[market.locationId];
    if (!position) continue;
    const straight = distance(sourcePosition, position) + distance(position, workPosition);
    if (straight - directDistance > allowedExtraDistance) continue;
    const first = quote?.(npc, market.locationId, npc.credits);
    const second = quote ? quoteFromStop(npc, market.locationId, workId, quote) : null;
    if (quote && (!first || !second)) continue;
    const actualDistance = first && second ? first.distance + second.distance : straight;
    const extraDistance = Math.max(0, actualDistance - directDistance);
    if (extraDistance > allowedExtraDistance) continue;
    const expense = (first?.fuelExpense ?? 0) + (second?.fuelExpense ?? 0);
    const extraExpense = Math.max(0, expense - (direct?.fuelExpense ?? 0));
    stops.set(market.locationId, { extraDistance, extraExpense });
  }
  return { directDistance, allowedExtraDistance, stops };
}

interface ScoredPlan {
  readonly plan: NpcResourceSideTradePlan;
  readonly score: number;
}

function destinationCandidate(
  resource: EconomyResourceDefinition,
  source: NpcTradeMarketView,
  destination: NpcTradeMarketView,
  workLocationId: string,
  maxQuantity: number,
  geometry: RouteGeometry,
  context: NpcSideTradeContext
): ScoredPlan | null {
  if (destination.locationId === source.locationId) return null;

  const detour = geometry.stops.get(destination.locationId);
  const buy = source.entries[resource.id];
  const sell = destination.entries[resource.id];
  if (!detour || !buy || !sell || sell.price <= buy.price) return null;

  const { extraDistance, extraExpense } = detour;
  const day = context.day ?? 0;
  const confidence = npcMarketConfidence(destination.observedDay ?? day, day);
  const sellUnitPrice = Math.max(1, Math.floor(sell.price * 0.94 * confidence));
  const costBasis = maxQuantity * buy.price;
  const expectedProfit = maxQuantity * sellUnitPrice - costBasis - extraExpense;
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
  source: NpcTradeMarketView,
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
    Math.floor(Math.max(0, npc.credits - npcWorkingCapital(npc)) / buy.price)
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

  const geometry = buildRouteGeometry(npc, workLocationId, sourcePosition, workPosition, context);
  if (!geometry) return null;

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
