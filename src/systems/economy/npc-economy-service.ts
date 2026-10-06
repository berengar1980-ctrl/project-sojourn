import type {
  EconomyMarketEntry,
  EconomyResourceDefinition,
  EconomyResourceId,
  NpcEconomyState,
} from '../../core/economy-types';
import type { EconomyMarketService } from './market-service';
import { findNpcResourceSideTrade, type EconomyPoint } from './npc-resource-side-trade';

interface PhysicalResourceAllocator {
  createMinedResource(resourceId: EconomyResourceId, amount: number): number;
  allocatePhysicalResource(resourceId: EconomyResourceId, amount: number): number;
}

function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
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

function buyFromMarket(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  locationId: string,
  resourceId: EconomyResourceId,
  requested: number,
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
  return moved;
}

function sellToMarket(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  locationId: string,
  resourceId: EconomyResourceId,
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
  return moved;
}

interface TradeRoute {
  readonly resourceId: EconomyResourceId;
  readonly destinationId: string;
  readonly quantity: number;
  readonly margin: number;
}

function bestTradeRoute(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[]
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

    for (const destination of markets.snapshot()) {
      if (destination.locationId === source.locationId) continue;
      const sell = destination.entries[resource.id];
      if (!sell) continue;
      const margin = Math.round(sell.price * 0.94) - buy.price;
      if (margin <= 0) continue;
      const score = margin * maxQuantity;
      if (!best || score > best.margin * best.quantity) {
        best = {
          resourceId: resource.id,
          destinationId: destination.locationId,
          quantity: maxQuantity,
          margin,
        };
      }
    }
  }
  return best;
}

function bestSaleLocation(
  markets: EconomyMarketService,
  resourceId: EconomyResourceId
): { locationId: string; entry: EconomyMarketEntry } | null {
  let best: { locationId: string; entry: EconomyMarketEntry } | null = null;
  for (const market of markets.snapshot()) {
    const entry = market.entries[resourceId];
    if (!entry) continue;
    if (!best || entry.price > best.entry.price) {
      best = { locationId: market.locationId, entry };
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

function runTraderDay(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  options: NpcEconomyServiceOptions
): void {
  const aboard = Object.entries(npc.cargo).find(([, value]) => quantity(value) > 0);
  if (aboard) {
    const destination = bestSaleLocation(markets, aboard[0]);
    if (!destination) return;
    if (npc.locationId !== destination.locationId) {
      requestNpcTravel(npc, destination.locationId, options, 'Verkaufsroute');
      return;
    }
    sellToMarket(npc, markets, destination.locationId, aboard[0]);
    return;
  }

  const route = bestTradeRoute(npc, markets, resources);
  if (!route) return;
  const moved = buyFromMarket(npc, markets, npc.locationId, route.resourceId, route.quantity);
  if (moved > 0) requestNpcTravel(npc, route.destinationId, options, 'Handelsroute');
}

function runResourceWorkerDay(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  allocator: PhysicalResourceAllocator,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number,
  options: NpcEconomyServiceOptions
): void {
  if (npc.sideTradePlan) {
    const plan = npc.sideTradePlan;
    if (npc.locationId !== plan.tradeLocationId) {
      requestNpcTravel(npc, plan.tradeLocationId, options, 'Nebenhandel · Verkauf');
      return;
    }

    sellToMarket(npc, markets, plan.tradeLocationId, plan.resourceId, plan.quantity);
    delete npc.sideTradePlan;
    requestNpcTravel(npc, plan.workLocationId, options, 'Rückkehr zum Arbeitsgebiet');
    return;
  }

  const used = npcCargoUsed(npc);
  const threshold = Math.max(1, Math.floor(npc.cargoCapacity * 0.82));

  if (used >= threshold) {
    const cargo = Object.entries(npc.cargo)
      .filter(([, value]) => quantity(value) > 0)
      .sort((first, second) => quantity(second[1]) - quantity(first[1]));
    for (const [resourceId] of cargo) {
      const destination = bestSaleLocation(markets, resourceId);
      if (!destination) continue;
      if (npc.locationId !== destination.locationId) {
        requestNpcTravel(npc, destination.locationId, options, 'Rohstoffverkauf');
        return;
      }
      sellToMarket(npc, markets, destination.locationId, resourceId);
    }
    return;
  }

  if (npc.workLocationId && npc.locationId !== npc.workLocationId) {
    const plan = findNpcResourceSideTrade(npc, npc.workLocationId, {
      markets: markets.snapshot(),
      resources,
      positions,
    });
    if (plan) {
      const normalCapacity = npc.normalCargoCapacity ?? npc.cargoCapacity;
      const moved = buyFromMarket(
        npc,
        markets,
        npc.locationId,
        plan.resourceId,
        plan.quantity,
        normalCapacity
      );
      if (moved > 0) {
        const scale = moved / plan.quantity;
        npc.sideTradePlan = {
          ...plan,
          quantity: moved,
          costBasis: Math.round(plan.costBasis * scale),
          expectedProfit: Math.round(plan.expectedProfit * scale),
        };
        requestNpcTravel(npc, plan.tradeLocationId, options, 'Nebenhandel');
        return;
      }
    }

    requestNpcTravel(npc, npc.workLocationId, options, 'Arbeitsflug');
    return;
  }

  const candidates = npc.workResourceIds;
  if (candidates.length === 0) return;
  const resourceId = candidates[day % candidates.length]!;
  const wanted = Math.min(cargoFree(npc), npc.role === 'miner' ? 8 : 5);
  const allocated = allocator.createMinedResource(resourceId, wanted);
  if (allocated > 0) {
    npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
  }
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

  const advanceDay = (day: number): void => {
    const target = Math.max(0, Math.floor(day));
    if (target <= lastDay) return;

    for (let current = lastDay + 1; current <= target; current += 1) {
      for (const npc of npcs) {
        if (options.travel?.isTravelling(npc)) continue;
        if (npc.role === 'trader' || npc.role === 'freighter') {
          runTraderDay(npc, markets, resources, options);
        } else if (npc.role === 'miner' || npc.role === 'salvager') {
          runResourceWorkerDay(npc, markets, allocator, resources, positions, current, options);
        }
      }
    }
    lastDay = target;
  };

  return {
    npcs,
    mineLocal(npc, resourceId, requestedQuantity) {
      const wanted = Math.min(quantity(requestedQuantity), cargoFree(npc));
      if (wanted <= 0) return 0;
      const allocated = allocator.createMinedResource(resourceId, wanted);
      if (allocated <= 0) return 0;
      npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
      return allocated;
    },
    salvageLocal(npc, resourceId, requestedQuantity) {
      const wanted = Math.min(quantity(requestedQuantity), cargoFree(npc));
      if (wanted <= 0) return 0;
      const allocated = allocator.allocatePhysicalResource(resourceId, wanted);
      if (allocated <= 0) return 0;
      npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
      return allocated;
    },
    dispatchLoadedWorker(npc) {
      const cargo = Object.entries(npc.cargo)
        .filter(([, amount]) => quantity(amount) > 0)
        .sort((first, second) => quantity(second[1]) - quantity(first[1]));
      if (cargo.length === 0) return false;
      for (const [resourceId] of cargo) {
        const destination = bestSaleLocation(markets, resourceId);
        if (!destination || destination.locationId === npc.locationId) continue;
        return requestNpcTravel(npc, destination.locationId, options, 'Rohstoffverkauf');
      }
      return false;
    },
    advanceDay,
    advanceNextDay() {
      advanceDay(lastDay + 1);
    },
  };
}
