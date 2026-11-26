import type {
  EconomyResourceDefinition,
  EconomyResourceId,
  NpcEconomyState,
} from '../../core/economy-types';

import {
  beginNpcAutonomyPhase,
  clearNpcPendingTravel,
  ensureNpcAutonomy,
  ensureNpcPersonality,
  npcDecisionThreshold,
  npcPersonalityTradeWeight,
  scheduleNpcTravel,
} from '../npcs/npc-autonomy';

import type { EconomyMarketService } from './market-service';

import { findNpcResourceSideTrade, type EconomyPoint } from './npc-resource-side-trade';

import { quantity, cargoFreeFor, cargoFree, npcCargoUsed } from './npc-cargo';
import { npcNeedsSafeReturn } from '../npcs/npc-operating-policy';

import { observeNpcMarket, npcKnownMarketViews } from './npc-market-knowledge';

import type { TradeRoute } from './npc-economy-types';
import { chooseNpcWorksite, finishNpcWorksite, type NpcWorkPlanning } from './npc-work-planning';
import {
  evaluateNpcPurchaseVoyage,
  evaluateNpcSaleVoyage,
  type NpcTravelQuoteFn,
} from './npc-operating-decisions';

export function buyFromMarket(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  locationId: string,
  resourceId: EconomyResourceId,
  requested: number,
  day: number,
  cargoCapacity = npc.cargoCapacity
): number {
  const entry = markets.getEntry(locationId, resourceId);
  if (!entry) return 0;
  const affordable = Math.floor(npc.credits / Math.max(1, entry.price));
  const moved = Math.min(
    quantity(requested),
    quantity(entry.stock),
    cargoFreeFor(npc, cargoCapacity),
    Math.max(0, affordable)
  );
  if (moved <= 0) return 0;

  npc.credits -= moved * entry.price;
  entry.stock -= moved;
  entry.demand = Math.min(1, entry.demand + moved / 5000);
  npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + moved;
  markets.recalculate(locationId, resourceId);
  observeNpcMarket(npc, markets, locationId, day);
  return moved;
}

export function npcNetSaleUnitPrice(npc: NpcEconomyState, price: number): number {
  const charter = 'tradeCharter' in npc ? npc.tradeCharter : undefined;
  const multiplier = charter === 'veylan' ? 0.93 : charter === 'mercator' ? 0.935 : 0.94;
  return Math.max(1, Math.round(price * multiplier));
}

export function sellToMarket(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  locationId: string,
  resourceId: EconomyResourceId,
  day: number,
  requested = Number.POSITIVE_INFINITY
): number {
  const entry = markets.getEntry(locationId, resourceId);
  const aboard = quantity(npc.cargo[resourceId] ?? 0);
  const requestedQuantity = Number.isFinite(requested) ? quantity(requested) : aboard;
  const moved = Math.min(aboard, requestedQuantity);
  if (!entry || moved <= 0) return 0;

  const unitPrice = npcNetSaleUnitPrice(npc, entry.price);
  npc.credits += moved * unitPrice;
  entry.stock += moved;
  entry.demand = Math.max(0, entry.demand - moved / 5000);
  const remaining = aboard - moved;
  if (remaining > 0) npc.cargo[resourceId] = remaining;
  else delete npc.cargo[resourceId];
  markets.recalculate(locationId, resourceId);
  observeNpcMarket(npc, markets, locationId, day);
  return moved;
}

function distanceBetween(
  positions: Readonly<Record<string, EconomyPoint>>,
  fromId: string,
  toId: string
): number {
  const from = positions[fromId];
  const to = positions[toId];
  if (!from || !to) return 0;
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function candidateTradeRoute(
  npc: NpcEconomyState,
  resource: EconomyResourceDefinition,
  buyPrice: number,
  maxUnits: number,
  destinationId: string,
  sellPrice: number,
  positions: Readonly<Record<string, EconomyPoint>>,
  observedDay: number,
  day: number,
  quoteTravel?: NpcTravelQuoteFn
): TradeRoute | null {
  const unitSale = npcNetSaleUnitPrice(npc, sellPrice);
  if (unitSale <= buyPrice) return null;
  const straightDistance = distanceBetween(positions, npc.locationId, destinationId);
  const estimate = evaluateNpcPurchaseVoyage(
    npc,
    destinationId,
    maxUnits,
    buyPrice,
    unitSale,
    straightDistance,
    quoteTravel
  );
  if (!estimate) return null;
  const age = Math.max(0, day - observedDay);
  return {
    resourceId: resource.id,
    destinationId,
    quantity: estimate.quantity,
    margin: unitSale - buyPrice,
    observedDay,
    score: npcPersonalityTradeWeight(
      npc,
      estimate.netProfit -
        (resource.legality === 'illegal' ? Math.round(maxUnits * buyPrice * 0.12) : 0),
      estimate.distance,
      age,
      destinationId
    ),
  };
}

function bestTradeRoute(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  quoteTravel?: NpcTravelQuoteFn
): TradeRoute | null {
  const source = markets.getMarket(npc.locationId);
  const free = cargoFree(npc);
  if (!source || free <= 0) return null;
  let best: TradeRoute | null = null;
  for (const resource of resources) {
    if (resource.legality === 'illegal' && !('smuggler' in npc && npc.smuggler)) continue;
    const buy = source.entries[resource.id];
    if (!buy || buy.stock <= 0 || buy.price <= 0) continue;
    const affordable = Math.floor(npc.credits / buy.price);
    const maxUnits = Math.min(free, quantity(buy.stock), affordable, 32);
    if (maxUnits <= 0) continue;
    for (const destination of Object.values(npc.marketIntel ?? {})) {
      if (destination.locationId === source.locationId) continue;
      const sell = destination.entries[resource.id];
      if (!sell) continue;
      const route = candidateTradeRoute(
        npc,
        resource,
        buy.price,
        maxUnits,
        destination.locationId,
        sell.price,
        positions,
        destination.observedDay,
        day,
        quoteTravel
      );
      if (route && (!best || route.score > best.score)) best = route;
    }
  }
  return best;
}

function bestSaleLocation(
  npc: NpcEconomyState,
  resourceId: EconomyResourceId,
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  quoteTravel?: NpcTravelQuoteFn
): { locationId: string; price: number; observedDay: number; score: number } | null {
  let best: { locationId: string; price: number; observedDay: number; score: number } | null = null;
  const aboard = Math.max(1, quantity(npc.cargo[resourceId] ?? 0));
  for (const market of Object.values(npc.marketIntel ?? {})) {
    const entry = market.entries[resourceId];
    if (!entry) continue;
    const expectedRevenue = Math.round(entry.price * 0.94) * aboard;
    const distance = distanceBetween(positions, npc.locationId, market.locationId);
    const quote = evaluateNpcSaleVoyage(
      npc,
      market.locationId,
      expectedRevenue,
      distance,
      quoteTravel
    );
    if (!quote) continue;
    const age = Math.max(0, day - market.observedDay);
    const score = npcPersonalityTradeWeight(
      npc,
      quote.netRevenue,
      quote.distance,
      age,
      market.locationId
    );
    if (!best || score > best.score) {
      best = {
        locationId: market.locationId,
        price: entry.price,
        observedDay: market.observedDay,
        score,
      };
    }
  }
  return best;
}

function scheduleTradeLoading(npc: NpcEconomyState, route: TradeRoute, reason: string): void {
  const autonomy = ensureNpcAutonomy(npc);
  autonomy.pendingTrade = {
    resourceId: route.resourceId,
    destinationId: route.destinationId,
    quantity: route.quantity,
    reason,
  };
  beginNpcAutonomyPhase(npc, 'loading');
}

function beginSale(npc: NpcEconomyState, resourceId: EconomyResourceId): void {
  const autonomy = ensureNpcAutonomy(npc);
  autonomy.pendingSaleResourceId = resourceId;
  beginNpcAutonomyPhase(npc, 'unloading');
}

export function beginRest(npc: NpcEconomyState): void {
  clearNpcPendingTravel(npc);
  const autonomy = ensureNpcAutonomy(npc);
  delete autonomy.pendingSaleResourceId;
  beginNpcAutonomyPhase(npc, npc.role === 'patrol' ? 'patrol-rest' : 'resting');
}

export function chooseTraderAction(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  quoteTravel?: NpcTravelQuoteFn
): void {
  const aboard = Object.entries(npc.cargo)
    .filter(([, value]) => quantity(value) > 0)
    .sort((first, second) => quantity(second[1]) - quantity(first[1]))[0];

  if (aboard) {
    const destination = bestSaleLocation(npc, aboard[0], positions, day, quoteTravel);
    if (!destination) {
      beginRest(npc);
      return;
    }
    if (npc.locationId === destination.locationId) {
      beginSale(npc, aboard[0]);
      return;
    }
    scheduleNpcTravel(npc, destination.locationId, 'Verkaufsroute');
    return;
  }

  const route = bestTradeRoute(npc, markets, resources, positions, day, quoteTravel);
  if (!route || route.score <= npcDecisionThreshold(npc)) {
    beginRest(npc);
    return;
  }
  scheduleTradeLoading(npc, route, 'Handelsroute');
}

function sideTradeWorthTaking(
  npc: NpcEconomyState,
  expectedProfit: number,
  costBasis: number
): boolean {
  const personality = ensureNpcPersonality(npc);
  const returnRate = expectedProfit / Math.max(1, costBasis);
  const minimumReturn = 0.05 + (1 - personality.profitDrive) * 0.08 + personality.patience * 0.04;
  return returnRate >= minimumReturn;
}

function returnDamagedWorkerToPort(npc: NpcEconomyState, quoteTravel?: NpcTravelQuoteFn): boolean {
  const worker = npc as NpcEconomyState & { hullHp?: number; hullMaxHp?: number };
  if (!npcNeedsSafeReturn(worker)) return false;
  if (npc.homePortId && npc.homePortId !== npc.locationId) {
    const possible = quoteTravel?.(npc, npc.homePortId, npc.credits);
    if (!quoteTravel || possible) {
      scheduleNpcTravel(npc, npc.homePortId, 'Notwendige Hüllenreparatur');
      return true;
    }
  }
  beginRest(npc);
  return true;
}

function handleWorkerSideTrade(npc: NpcEconomyState): boolean {
  const plan = npc.sideTradePlan;
  if (!plan) return false;
  if (quantity(npc.cargo[plan.resourceId] ?? 0) > 0) {
    if (npc.locationId === plan.tradeLocationId) beginSale(npc, plan.resourceId);
    else scheduleNpcTravel(npc, plan.tradeLocationId, 'Nebenhandel · Verkauf');
    return true;
  }
  delete npc.sideTradePlan;
  return false;
}

function handleWorkerCargo(
  npc: NpcEconomyState,
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  quoteTravel?: NpcTravelQuoteFn
): boolean {
  if (npcCargoUsed(npc) <= 0) return false;
  const cargo = Object.entries(npc.cargo)
    .filter(([, value]) => quantity(value) > 0)
    .sort((first, second) => quantity(second[1]) - quantity(first[1]));
  const first = cargo[0];
  if (!first) {
    beginRest(npc);
    return true;
  }
  const destination = bestSaleLocation(npc, first[0], positions, day, quoteTravel);
  if (!destination) {
    beginRest(npc);
    return true;
  }
  if (npc.locationId === destination.locationId) beginSale(npc, first[0]);
  else scheduleNpcTravel(npc, destination.locationId, 'Rohstoffverkauf');
  return true;
}

function handleWorkerAtWorksite(npc: NpcEconomyState): boolean {
  if (!npc.workLocationId || npc.locationId !== npc.workLocationId) return false;
  const autonomy = ensureNpcAutonomy(npc);
  autonomy.phase = 'working';
  autonomy.secondsRemaining = 0;
  const state = npc as NpcEconomyState & { activityId?: string; activity?: string };
  state.activityId = npc.role === 'miner' ? 'mining' : 'salvage';
  state.activity = npc.role === 'miner' ? 'Scannen und Ressourcenabbau' : 'Scannen und Bergung';
  return true;
}

function arrangeWorkerJourney(
  npc: NpcEconomyState,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  quoteTravel?: NpcTravelQuoteFn
): void {
  if (!npc.workLocationId) {
    beginNpcAutonomyPhase(npc, 'working');
    return;
  }
  const plan = findNpcResourceSideTrade(npc, npc.workLocationId, {
    markets: npcKnownMarketViews(npc),
    day,
    resources,
    positions,
  });
  const funded = plan
    ? quoteTravel?.(npc, plan.tradeLocationId, npc.credits - plan.costBasis)
    : null;
  const netProfit = plan ? plan.expectedProfit - (funded?.fuelExpense ?? 0) : 0;
  const viable = !quoteTravel || Boolean(funded);
  if (plan && viable && sideTradeWorthTaking(npc, netProfit, plan.costBasis)) {
    npc.sideTradePlan = plan;
    const route: TradeRoute = {
      resourceId: plan.resourceId,
      destinationId: plan.tradeLocationId,
      quantity: plan.quantity,
      margin: Math.max(1, Math.round(plan.expectedProfit / Math.max(1, plan.quantity))),
      observedDay: day,
      score: plan.expectedProfit,
    };
    scheduleTradeLoading(npc, route, 'Nebenhandel');
    return;
  }
  scheduleNpcTravel(npc, npc.workLocationId, 'Arbeitsflug');
}

export function chooseWorkerAction(
  npc: NpcEconomyState,
  _markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  quoteTravel?: NpcTravelQuoteFn,
  planning?: NpcWorkPlanning
): void {
  ensureNpcAutonomy(npc);
  if (returnDamagedWorkerToPort(npc, quoteTravel)) return;
  if (handleWorkerSideTrade(npc)) return;
  if (handleWorkerCargo(npc, positions, day, quoteTravel)) return;
  if (
    planning &&
    npc.workLocationId &&
    !planning.sites.some((site) => site.id === npc.workLocationId && site.role === npc.role)
  ) {
    finishNpcWorksite(npc);
  }
  if (planning && !npc.workLocationId) {
    const candidate = chooseNpcWorksite(npc, planning, resources, positions, quoteTravel, day);
    if (!candidate) {
      beginRest(npc);
      return;
    }
    npc.workLocationId = candidate.site.id;
    npc.workResourceIds = candidate.resourceIds;
  }
  if (handleWorkerAtWorksite(npc)) return;
  arrangeWorkerJourney(npc, resources, positions, day, quoteTravel);
}
