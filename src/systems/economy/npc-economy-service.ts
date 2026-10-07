import type {
  EconomyMarketState,
  EconomyResourceDefinition,
  EconomyResourceId,
  NpcEconomyState,
  NpcMarketIntelLocation,
} from '../../core/economy-types';
import {
  advanceNpcAutonomyTimer,
  beginNpcAutonomyPhase,
  clearNpcPendingTravel,
  ensureNpcAutonomy,
  ensureNpcPersonality,
  markNpcArrival,
  markNpcTravelStarted,
  npcDecisionThreshold,
  npcPersonalityTradeWeight,
  scheduleNpcTravel,
} from '../npcs/npc-autonomy';
import type { EconomyMarketService } from './market-service';
import {
  findNpcResourceSideTrade,
  type EconomyPoint,
  type NpcTradeMarketView,
} from './npc-resource-side-trade';

interface PhysicalResourceAllocator {
  createMinedResource(resourceId: EconomyResourceId, amount: number): number;
  allocatePhysicalResource(resourceId: EconomyResourceId, amount: number): number;
}

const INITIAL_TRADER_REMOTE_MARKETS = 5;
const INITIAL_WORKER_REMOTE_MARKETS = 4;
const INITIAL_PATROL_REMOTE_MARKETS = 2;

function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function npcCargoUsed(npc: NpcEconomyState): number {
  return Object.values(npc.cargo).reduce((sum, value) => sum + quantity(value), 0);
}

function cargoFreeFor(npc: NpcEconomyState, capacity: number): number {
  return Math.max(0, quantity(capacity) - npcCargoUsed(npc));
}

function cargoFree(npc: NpcEconomyState): number {
  return cargoFreeFor(npc, npc.cargoCapacity);
}

function ensureIntel(npc: NpcEconomyState): Record<string, NpcMarketIntelLocation> {
  npc.marketIntel ??= {};
  return npc.marketIntel;
}

function snapshotMarket(market: EconomyMarketState, day: number): NpcMarketIntelLocation {
  return {
    locationId: market.locationId,
    observedDay: Math.max(0, Math.floor(day)),
    entries: Object.fromEntries(
      Object.values(market.entries).map((entry) => [
        entry.resourceId,
        {
          resourceId: entry.resourceId,
          price: Math.max(1, Math.round(entry.price)),
          stock: quantity(entry.stock),
        },
      ])
    ),
  };
}

export function observeNpcMarket(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  locationId: string,
  day: number
): boolean {
  const market = markets.getMarket(locationId);
  if (!market) return false;
  ensureIntel(npc)[locationId] = snapshotMarket(market, day);
  return true;
}

export function npcMarketIntelAge(
  npc: NpcEconomyState,
  locationId: string,
  day: number
): number | null {
  const observed = npc.marketIntel?.[locationId];
  if (!observed) return null;
  return Math.max(0, Math.floor(day) - observed.observedDay);
}

export function npcKnownMarketIds(npc: NpcEconomyState): readonly string[] {
  return Object.keys(npc.marketIntel ?? {}).sort();
}

function npcKnownMarketViews(npc: NpcEconomyState): readonly NpcTradeMarketView[] {
  return Object.values(npc.marketIntel ?? {}).map((market) => ({
    locationId: market.locationId,
    entries: market.entries,
  }));
}

function initialRemoteMarketCount(npc: NpcEconomyState): number {
  if (npc.role === 'trader' || npc.role === 'freighter') return INITIAL_TRADER_REMOTE_MARKETS;
  if (npc.role === 'miner' || npc.role === 'salvager') return INITIAL_WORKER_REMOTE_MARKETS;
  return INITIAL_PATROL_REMOTE_MARKETS;
}

function intelCandidateScore(
  npc: NpcEconomyState,
  locationId: string,
  positions: Readonly<Record<string, EconomyPoint>>
): number {
  const source = positions[npc.locationId];
  const target = positions[locationId];
  const personalityBias = (hashText(npc.id + ':' + locationId) % 1000) / 1000;
  if (!source || !target) return personalityBias * 10000;
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  return distance + personalityBias * 900;
}

function initializeNpcMarketIntel(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number
): void {
  const existing = ensureIntel(npc);
  observeNpcMarket(npc, markets, npc.locationId, day);

  const unknown = markets
    .snapshot()
    .filter((market) => market.locationId !== npc.locationId && !existing[market.locationId])
    .map((market) => ({
      market,
      score: intelCandidateScore(npc, market.locationId, positions),
    }))
    .sort((first, second) => first.score - second.score)
    .slice(0, initialRemoteMarketCount(npc));

  for (const candidate of unknown) {
    existing[candidate.market.locationId] = snapshotMarket(candidate.market, day);
  }

  const personality = ensureNpcPersonality(npc);
  if (!personality.preferredMarketId) {
    const knownRemote = Object.keys(existing)
      .filter((locationId) => locationId !== npc.locationId)
      .sort();
    if (knownRemote.length > 0) {
      const preferred =
        knownRemote[hashText(npc.id + ':preferred-market') % knownRemote.length];
      if (preferred) personality.preferredMarketId = preferred;
    }
  }
}

function buyFromMarket(
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

function sellToMarket(
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

  const unitPrice = Math.max(1, Math.round(entry.price * 0.94));
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

interface TradeRoute {
  readonly resourceId: EconomyResourceId;
  readonly destinationId: string;
  readonly quantity: number;
  readonly margin: number;
  readonly observedDay: number;
  readonly score: number;
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

function bestTradeRoute(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number
): TradeRoute | null {
  const source = markets.getMarket(npc.locationId);
  const free = cargoFree(npc);
  if (!source || free <= 0) return null;

  let best: TradeRoute | null = null;
  for (const resource of resources) {
    if (resource.legality === 'illegal') continue;
    const buy = source.entries[resource.id];
    if (!buy || buy.stock <= 0 || buy.price <= 0) continue;
    const affordable = Math.floor(npc.credits / buy.price);
    const maxQuantity = Math.min(free, quantity(buy.stock), affordable, 32);
    if (maxQuantity <= 0) continue;

    for (const destination of Object.values(npc.marketIntel ?? {})) {
      if (destination.locationId === source.locationId) continue;
      const sell = destination.entries[resource.id];
      if (!sell) continue;
      const margin = Math.round(sell.price * 0.94) - buy.price;
      if (margin <= 0) continue;
      const grossProfit = margin * maxQuantity;
      const distance = distanceBetween(positions, source.locationId, destination.locationId);
      const age = Math.max(0, day - destination.observedDay);
      const score = npcPersonalityTradeWeight(
        npc,
        grossProfit,
        distance,
        age,
        destination.locationId
      );
      if (!best || score > best.score) {
        best = {
          resourceId: resource.id,
          destinationId: destination.locationId,
          quantity: maxQuantity,
          margin,
          observedDay: destination.observedDay,
          score,
        };
      }
    }
  }
  return best;
}

function bestSaleLocation(
  npc: NpcEconomyState,
  resourceId: EconomyResourceId,
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number
): { locationId: string; price: number; observedDay: number; score: number } | null {
  let best: { locationId: string; price: number; observedDay: number; score: number } | null = null;
  const aboard = Math.max(1, quantity(npc.cargo[resourceId] ?? 0));
  for (const market of Object.values(npc.marketIntel ?? {})) {
    const entry = market.entries[resourceId];
    if (!entry) continue;
    const expectedRevenue = Math.round(entry.price * 0.94) * aboard;
    const distance = distanceBetween(positions, npc.locationId, market.locationId);
    const age = Math.max(0, day - market.observedDay);
    const score = npcPersonalityTradeWeight(
      npc,
      expectedRevenue,
      distance,
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

function requestNpcTravel(
  npc: NpcEconomyState,
  destinationId: string,
  options: NpcEconomyServiceOptions,
  reason: string
): boolean {
  if (destinationId === npc.locationId) return true;
  if (options.travel) return options.travel.requestTravel(npc, destinationId, reason);
  npc.locationId = destinationId;
  return true;
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

function beginRest(npc: NpcEconomyState): void {
  clearNpcPendingTravel(npc);
  const autonomy = ensureNpcAutonomy(npc);
  delete autonomy.pendingSaleResourceId;
  beginNpcAutonomyPhase(npc, npc.role === 'patrol' ? 'patrol-rest' : 'resting');
}

function chooseTraderAction(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number
): void {
  const aboard = Object.entries(npc.cargo)
    .filter(([, value]) => quantity(value) > 0)
    .sort((first, second) => quantity(second[1]) - quantity(first[1]))[0];

  if (aboard) {
    const destination = bestSaleLocation(npc, aboard[0], positions, day);
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

  const route = bestTradeRoute(npc, markets, resources, positions, day);
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
  const minimumReturn =
    0.05 + (1 - personality.profitDrive) * 0.08 + personality.patience * 0.04;
  return returnRate >= minimumReturn;
}

function chooseWorkerAction(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number
): void {
  const autonomy = ensureNpcAutonomy(npc);
  const used = npcCargoUsed(npc);
  const threshold = Math.max(1, Math.floor(npc.cargoCapacity));

  if (npc.sideTradePlan) {
    const plan = npc.sideTradePlan;
    if (npc.locationId === plan.tradeLocationId && quantity(npc.cargo[plan.resourceId] ?? 0) > 0) {
      beginSale(npc, plan.resourceId);
      return;
    }
    if (npc.locationId !== plan.tradeLocationId && quantity(npc.cargo[plan.resourceId] ?? 0) > 0) {
      scheduleNpcTravel(npc, plan.tradeLocationId, 'Nebenhandel · Verkauf');
      return;
    }
    delete npc.sideTradePlan;
  }

  if (used >= threshold) {
    const cargo = Object.entries(npc.cargo)
      .filter(([, value]) => quantity(value) > 0)
      .sort((first, second) => quantity(second[1]) - quantity(first[1]));
    const first = cargo[0];
    if (!first) {
      beginRest(npc);
      return;
    }
    const destination = bestSaleLocation(npc, first[0], positions, day);
    if (!destination) {
      beginRest(npc);
      return;
    }
    if (npc.locationId === destination.locationId) {
      beginSale(npc, first[0]);
    } else {
      scheduleNpcTravel(npc, destination.locationId, 'Rohstoffverkauf');
    }
    return;
  }

  if (npc.workLocationId && npc.locationId === npc.workLocationId) {
    autonomy.phase = 'working';
    autonomy.secondsRemaining = 0;
    const state = npc as NpcEconomyState & { activityId?: string; activity?: string };
    state.activityId = npc.role === 'miner' ? 'mining' : 'salvage';
    state.activity =
      npc.role === 'miner' ? 'Scannen und Ressourcenabbau' : 'Scannen und Bergung';
    return;
  }

  if (npc.workLocationId) {
    const plan = findNpcResourceSideTrade(npc, npc.workLocationId, {
      markets: npcKnownMarketViews(npc),
      resources,
      positions,
    });
    if (plan && sideTradeWorthTaking(npc, plan.expectedProfit, plan.costBasis)) {
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
    return;
  }

  beginNpcAutonomyPhase(npc, 'working');
}

function completeLoading(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  day: number
): void {
  const autonomy = ensureNpcAutonomy(npc);
  const pending = autonomy.pendingTrade;
  if (!pending) {
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }

  const capacity =
    npc.sideTradePlan && pending.reason === 'Nebenhandel'
      ? npc.normalCargoCapacity ?? npc.cargoCapacity
      : npc.cargoCapacity;
  const moved = buyFromMarket(
    npc,
    markets,
    npc.locationId,
    pending.resourceId,
    pending.quantity,
    day,
    capacity
  );
  delete autonomy.pendingTrade;
  if (moved <= 0) {
    if (npc.sideTradePlan) delete npc.sideTradePlan;
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }

  autonomy.pendingDestinationId = pending.destinationId;
  autonomy.pendingReason = pending.reason;
  beginNpcAutonomyPhase(npc, 'launch-prep');
}

function completeUnloading(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  day: number
): void {
  const autonomy = ensureNpcAutonomy(npc);
  const resourceId = autonomy.pendingSaleResourceId;
  if (!resourceId) {
    beginRest(npc);
    return;
  }

  const requested =
    npc.sideTradePlan?.resourceId === resourceId
      ? npc.sideTradePlan.quantity
      : Number.POSITIVE_INFINITY;
  sellToMarket(npc, markets, npc.locationId, resourceId, day, requested);
  if (
    npc.sideTradePlan &&
    npc.sideTradePlan.resourceId === resourceId &&
    npc.locationId === npc.sideTradePlan.tradeLocationId
  ) {
    const workLocationId = npc.sideTradePlan.workLocationId;
    delete npc.sideTradePlan;
    autonomy.lastTradeDestinationId = npc.locationId;
    delete autonomy.pendingSaleResourceId;
    beginNpcAutonomyPhase(npc, 'resting');
    autonomy.pendingDestinationId = workLocationId;
    autonomy.pendingReason = 'Rückkehr zum Arbeitsgebiet';
    return;
  }
  autonomy.lastTradeDestinationId = npc.locationId;
  delete autonomy.pendingSaleResourceId;
  beginRest(npc);
}

function startPendingTravel(npc: NpcEconomyState, options: NpcEconomyServiceOptions): void {
  const autonomy = ensureNpcAutonomy(npc);
  const destinationId = autonomy.pendingDestinationId;
  const reason = autonomy.pendingReason ?? 'Flug';
  if (!destinationId) {
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }

  const accepted = requestNpcTravel(npc, destinationId, options, reason);
  if (!accepted) {
    clearNpcPendingTravel(npc);
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }

  if (options.travel) {
    markNpcTravelStarted(npc);
  } else {
    markNpcArrival(npc);
  }
}

function chooseReadyAction(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  options: NpcEconomyServiceOptions
): void {
  const autonomy = ensureNpcAutonomy(npc);
  if (autonomy.pendingDestinationId && !autonomy.pendingTrade) {
    beginNpcAutonomyPhase(npc, 'launch-prep');
    return;
  }

  if (npc.role === 'trader' || npc.role === 'freighter') {
    chooseTraderAction(npc, markets, resources, positions, day);
    return;
  }
  if (npc.role === 'miner' || npc.role === 'salvager') {
    chooseWorkerAction(npc, markets, resources, positions, day);
    return;
  }
  if (npc.role === 'patrol') {
    const accepted = options.travel?.requestPatrol?.(npc) ?? false;
    if (accepted) markNpcTravelStarted(npc);
    else beginNpcAutonomyPhase(npc, 'patrol-rest');
    return;
  }
  beginRest(npc);
}

function advanceNpcActivity(
  npc: NpcEconomyState,
  deltaSeconds: number,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  options: NpcEconomyServiceOptions
): void {
  const autonomy = ensureNpcAutonomy(npc);
  const travelling = options.travel?.isTravelling(npc) ?? false;

  if (travelling) {
    if (!autonomy.wasTravelling || autonomy.phase !== 'travel') markNpcTravelStarted(npc);
    return;
  }

  if (autonomy.wasTravelling || autonomy.phase === 'travel') {
    markNpcArrival(npc);
    observeNpcMarket(npc, markets, npc.locationId, day);
    return;
  }

  if (autonomy.lastLocationId !== npc.locationId) {
    markNpcArrival(npc);
    observeNpcMarket(npc, markets, npc.locationId, day);
    return;
  }

  if (autonomy.phase === 'working') {
    if (npcCargoUsed(npc) >= Math.max(1, Math.floor(npc.cargoCapacity))) {
      beginNpcAutonomyPhase(npc, 'thinking');
    }
    return;
  }

  if (autonomy.phase === 'ready') {
    chooseReadyAction(npc, markets, resources, positions, day, options);
    return;
  }

  if (!advanceNpcAutonomyTimer(npc, deltaSeconds)) return;

  if (autonomy.phase === 'docking') {
    beginRest(npc);
  } else if (autonomy.phase === 'unloading') {
    completeUnloading(npc, markets, day);
  } else if (autonomy.phase === 'resting') {
    beginNpcAutonomyPhase(npc, 'thinking');
  } else if (autonomy.phase === 'thinking') {
    beginNpcAutonomyPhase(npc, 'ready', 0);
    chooseReadyAction(npc, markets, resources, positions, day, options);
  } else if (autonomy.phase === 'loading') {
    completeLoading(npc, markets, day);
  } else if (autonomy.phase === 'launch-prep') {
    startPendingTravel(npc, options);
  } else if (autonomy.phase === 'patrol-rest') {
    beginNpcAutonomyPhase(npc, 'ready', 0);
    chooseReadyAction(npc, markets, resources, positions, day, options);
  }
}

function abstractWorkerDay(
  npc: NpcEconomyState,
  allocator: PhysicalResourceAllocator,
  day: number
): void {
  const autonomy = ensureNpcAutonomy(npc);
  if (autonomy.phase !== 'working') return;
  if (npc.workLocationId && npc.locationId !== npc.workLocationId) return;

  const candidates = npc.workResourceIds;
  if (candidates.length === 0) return;
  const resourceId = candidates[day % candidates.length]!;
  const wanted = Math.min(cargoFree(npc), npc.role === 'miner' ? 8 : 5);
  if (wanted <= 0) {
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }
  const allocated =
    npc.role === 'salvager'
      ? allocator.allocatePhysicalResource(resourceId, wanted)
      : allocator.createMinedResource(resourceId, wanted);
  if (allocated > 0) {
    npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
  }
  if (cargoFree(npc) <= 0) beginNpcAutonomyPhase(npc, 'thinking');
}

export interface NpcEconomyService {
  readonly npcs: readonly NpcEconomyState[];
  mineLocal(npc: NpcEconomyState, resourceId: EconomyResourceId, requestedQuantity: number): number;
  salvageLocal(
    npc: NpcEconomyState,
    resourceId: EconomyResourceId,
    requestedQuantity: number
  ): number;
  dispatchLoadedWorker(npc: NpcEconomyState): boolean;
  tick(deltaSeconds: number): void;
  advanceDay(day: number): void;
  advanceNextDay(): void;
}

export interface NpcEconomyServiceOptions {
  readonly positions?: Readonly<Record<string, EconomyPoint>>;
  readonly travel?: {
    readonly requestTravel: (
      npc: NpcEconomyState,
      destinationId: string,
      reason: string
    ) => boolean;
    readonly requestPatrol?: (npc: NpcEconomyState) => boolean;
    readonly isTravelling: (npc: NpcEconomyState) => boolean;
  };
}

export function createNpcEconomyService(
  markets: EconomyMarketService,
  allocator: PhysicalResourceAllocator,
  resources: readonly EconomyResourceDefinition[],
  npcs: readonly NpcEconomyState[],
  options: NpcEconomyServiceOptions = {}
): NpcEconomyService {
  let lastDay = -1;
  const positions = options.positions ?? {};

  for (const npc of npcs) {
    if ((npc as NpcEconomyState & { pirate?: boolean }).pirate) continue;
    initializeNpcMarketIntel(npc, markets, positions, 0);
    const personality = ensureNpcPersonality(npc);
    ensureNpcAutonomy(npc);
    const sectorNpc = npc as NpcEconomyState & { workRiskPreference?: 'safe' | 'risky' };
    if (sectorNpc.workRiskPreference !== undefined) {
      sectorNpc.workRiskPreference = personality.riskTolerance >= 0.55 ? 'risky' : 'safe';
    }
  }

  const advanceDay = (day: number): void => {
    const target = Math.max(0, Math.floor(day));
    if (target <= lastDay) return;

    for (let current = lastDay + 1; current <= target; current += 1) {
      for (const npc of npcs) {
        if ((npc as NpcEconomyState & { pirate?: boolean }).pirate) continue;
        if (options.travel?.isTravelling(npc)) continue;
        observeNpcMarket(npc, markets, npc.locationId, current);
        if (npc.role === 'miner' || npc.role === 'salvager') {
          abstractWorkerDay(npc, allocator, current);
        }
      }
    }
    lastDay = target;
  };

  return {
    npcs,
    mineLocal(npc, resourceId, requestedQuantity) {
      beginNpcAutonomyPhase(npc, 'working', 0);
      const wanted = Math.min(quantity(requestedQuantity), cargoFree(npc));
      if (wanted <= 0) return 0;
      const allocated = allocator.createMinedResource(resourceId, wanted);
      if (allocated <= 0) return 0;
      npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
      return allocated;
    },
    salvageLocal(npc, resourceId, requestedQuantity) {
      beginNpcAutonomyPhase(npc, 'working', 0);
      const wanted = Math.min(quantity(requestedQuantity), cargoFree(npc));
      if (wanted <= 0) return 0;
      const allocated = allocator.allocatePhysicalResource(resourceId, wanted);
      if (allocated <= 0) return 0;
      npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
      return allocated;
    },
    dispatchLoadedWorker(npc) {
      if (npcCargoUsed(npc) <= 0) return false;
      beginNpcAutonomyPhase(npc, 'thinking');
      return true;
    },
    tick(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const dt = Math.min(deltaSeconds, 0.25);
      for (const npc of npcs) {
        if ((npc as NpcEconomyState & { pirate?: boolean }).pirate) continue;
        advanceNpcActivity(npc, dt, markets, resources, positions, Math.max(0, lastDay), options);
      }
    },
    advanceDay,
    advanceNextDay() {
      advanceDay(lastDay + 1);
    },
  };
}
