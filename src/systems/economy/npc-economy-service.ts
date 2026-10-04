import type {
  EconomyMarketEntry,
  EconomyResourceDefinition,
  EconomyResourceId,
  NpcEconomyState,
} from '../../core/economy-types';
import type { EconomyMarketService } from './market-service';

interface PhysicalResourceAllocator {
  createMinedResource(resourceId: EconomyResourceId, amount: number): number;
}

function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function npcCargoUsed(npc: NpcEconomyState): number {
  return Object.values(npc.cargo).reduce((sum, value) => sum + quantity(value), 0);
}

function cargoFree(npc: NpcEconomyState): number {
  return Math.max(0, quantity(npc.cargoCapacity) - npcCargoUsed(npc));
}

function buyFromMarket(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  locationId: string,
  resourceId: EconomyResourceId,
  requested: number
): number {
  const entry = markets.getEntry(locationId, resourceId);
  if (!entry) return 0;
  const affordable = Math.floor(npc.credits / Math.max(1, entry.price));
  const moved = Math.min(
    quantity(requested),
    quantity(entry.stock),
    cargoFree(npc),
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
  resourceId: EconomyResourceId
): number {
  const entry = markets.getEntry(locationId, resourceId);
  const aboard = quantity(npc.cargo[resourceId] ?? 0);
  if (!entry || aboard <= 0) return 0;

  const unitPrice = Math.max(1, Math.round(entry.price * 0.94));
  npc.credits += aboard * unitPrice;
  entry.stock += aboard;
  entry.demand = Math.max(0, entry.demand - aboard / 5000);
  delete npc.cargo[resourceId];
  markets.recalculate(locationId, resourceId);
  return aboard;
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

function runTraderDay(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[]
): void {
  const aboard = Object.entries(npc.cargo).find(([, value]) => quantity(value) > 0);
  if (aboard) {
    const destination = bestSaleLocation(markets, aboard[0]);
    if (!destination) return;
    npc.locationId = destination.locationId;
    sellToMarket(npc, markets, destination.locationId, aboard[0]);
    return;
  }

  const route = bestTradeRoute(npc, markets, resources);
  if (!route) return;
  const moved = buyFromMarket(npc, markets, npc.locationId, route.resourceId, route.quantity);
  if (moved > 0) npc.locationId = route.destinationId;
}

function runResourceWorkerDay(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  allocator: PhysicalResourceAllocator,
  day: number
): void {
  const used = npcCargoUsed(npc);
  const threshold = Math.max(1, Math.floor(npc.cargoCapacity * 0.82));

  if (used >= threshold) {
    const cargo = Object.entries(npc.cargo)
      .filter(([, value]) => quantity(value) > 0)
      .sort((first, second) => quantity(second[1]) - quantity(first[1]));
    for (const [resourceId] of cargo) {
      const destination = bestSaleLocation(markets, resourceId);
      if (!destination) continue;
      npc.locationId = destination.locationId;
      sellToMarket(npc, markets, destination.locationId, resourceId);
    }
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
  advanceDay(day: number): void;
  advanceNextDay(): void;
}

export function createNpcEconomyService(
  markets: EconomyMarketService,
  allocator: PhysicalResourceAllocator,
  resources: readonly EconomyResourceDefinition[],
  npcs: readonly NpcEconomyState[]
): NpcEconomyService {
  let lastDay = -1;

  const advanceDay = (day: number): void => {
    const target = Math.max(0, Math.floor(day));
    if (target <= lastDay) return;

    for (let current = lastDay + 1; current <= target; current += 1) {
      for (const npc of npcs) {
        if (npc.role === 'trader') runTraderDay(npc, markets, resources);
        else runResourceWorkerDay(npc, markets, allocator, current);
      }
    }
    lastDay = target;
  };

  return {
    npcs,
    advanceDay,
    advanceNextDay() {
      advanceDay(lastDay + 1);
    },
  };
}
