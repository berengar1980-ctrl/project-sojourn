import type {
  EconomyMarketState,
  EconomyResourceDefinition,
  EconomyResourceId,
  EconomyResourcePool,
  PlayerEconomyState,
} from '../../core/economy-types';
import type { EconomyMarketService } from './market-service';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function playerQuantity(player: PlayerEconomyState, resourceId: EconomyResourceId): number {
  return quantity(player.cargo[resourceId]?.qty ?? 0);
}

function marketQuantity(market: EconomyMarketState, resourceId: EconomyResourceId): number {
  return quantity(market.entries[resourceId]?.stock ?? 0);
}

function initialPools(
  resources: readonly EconomyResourceDefinition[],
  markets: readonly EconomyMarketState[],
  player: PlayerEconomyState
): Record<EconomyResourceId, EconomyResourcePool> {
  const pools: Record<EconomyResourceId, EconomyResourcePool> = {};
  for (const resource of resources) {
    let target = playerQuantity(player, resource.id);
    for (const market of markets) target += marketQuantity(market, resource.id);
    pools[resource.id] = {
      target,
      reserve: 0,
      externalImports: 0,
      recordedLosses: 0,
    };
  }
  return pools;
}

function totalResource(
  resourceId: EconomyResourceId,
  markets: readonly EconomyMarketState[],
  player: PlayerEconomyState,
  pool: EconomyResourcePool
): number {
  let total = quantity(pool.reserve) + playerQuantity(player, resourceId);
  for (const market of markets) total += marketQuantity(market, resourceId);
  return total;
}

function weightedPick(
  markets: readonly EconomyMarketState[],
  resourceId: EconomyResourceId,
  random: () => number
): EconomyMarketState | null {
  const candidates = markets
    .filter((market) => !market.produces.has(resourceId) && marketQuantity(market, resourceId) > 0)
    .map((market) => ({
      market,
      weight:
        (market.needs.has(resourceId) ? 4 : 1) * Math.max(1, marketQuantity(market, resourceId)),
    }));
  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = random() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate.market;
  }
  return candidates[0]!.market;
}

function consumeToReserve(
  resourceId: EconomyResourceId,
  wanted: number,
  markets: readonly EconomyMarketState[],
  pool: EconomyResourcePool,
  random: () => number
): number {
  let remaining = quantity(wanted);
  let consumed = 0;

  while (remaining > 0) {
    const market = weightedPick(markets, resourceId, random);
    if (!market) break;
    const entry = market.entries[resourceId]!;
    const moved = Math.min(remaining, quantity(entry.stock), Math.max(1, Math.ceil(remaining / 3)));
    entry.stock -= moved;
    pool.reserve += moved;
    consumed += moved;
    remaining -= moved;
  }
  return consumed;
}

function produceFromReserve(
  resourceId: EconomyResourceId,
  markets: readonly EconomyMarketState[],
  pool: EconomyResourcePool,
  random: () => number
): number {
  let produced = 0;
  for (const market of markets) {
    if (!market.produces.has(resourceId)) continue;
    const entry = market.entries[resourceId];
    if (!entry || pool.reserve <= 0) continue;

    const wanted = Math.max(1, Math.floor(4 + random() * 8 + entry.production * 5));
    const quantityToMove = Math.min(quantity(pool.reserve), wanted);
    pool.reserve -= quantityToMove;
    entry.stock += quantityToMove;
    produced += quantityToMove;
  }
  return produced;
}

function legalStabilization(
  resourceId: EconomyResourceId,
  markets: readonly EconomyMarketState[],
  player: PlayerEconomyState,
  pool: EconomyResourcePool
): number {
  if (pool.target <= 0) return 0;
  const current = totalResource(resourceId, markets, player, pool);
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

function illegalStabilization(
  resourceId: EconomyResourceId,
  markets: readonly EconomyMarketState[],
  player: PlayerEconomyState,
  pool: EconomyResourcePool
): number {
  if (pool.target <= 0) return 0;
  const current = totalResource(resourceId, markets, player, pool);
  const ratio = current / pool.target;
  if (ratio > 0.9) return 0;

  const ceiling = Math.floor(pool.target * 1.1);
  const wanted = Math.min(
    Math.max(0, ceiling - current),
    Math.max(1, Math.ceil((pool.target - current) * 0.12))
  );
  if (wanted <= 0) return 0;

  const sources = markets.filter((market) => market.entries[resourceId]);
  if (sources.length === 0) return 0;
  const market = [...sources].sort(
    (first, second) => marketQuantity(first, resourceId) - marketQuantity(second, resourceId)
  )[0]!;
  market.entries[resourceId]!.stock += wanted;
  pool.externalImports += wanted;
  return wanted;
}

function driftDemand(
  market: EconomyMarketState,
  resourceId: EconomyResourceId,
  random: () => number
) {
  const entry = market.entries[resourceId];
  if (!entry) return;
  const role =
    (market.needs.has(resourceId) ? 0.018 : 0) - (market.produces.has(resourceId) ? 0.01 : 0);
  const noise = (random() - 0.5) * 0.024;
  entry.demand = clamp(entry.demand + role + noise, 0.05, 1);
}

export interface EconomySimulationService {
  readonly pools: Readonly<Record<EconomyResourceId, EconomyResourcePool>>;
  getResourceTotal(resourceId: EconomyResourceId): number;
  advanceDay(day: number): void;
  advanceNextDay(): void;
}

export function createEconomySimulationService(
  marketsService: EconomyMarketService,
  player: PlayerEconomyState,
  resources: readonly EconomyResourceDefinition[],
  seed = 1
): EconomySimulationService {
  const markets = marketsService.snapshot();
  const pools = initialPools(resources, markets, player);
  let lastDay = -1;

  const advanceDay = (day: number): void => {
    const targetDay = Math.max(0, Math.floor(day));
    if (targetDay <= lastDay) return;

    for (let currentDay = lastDay + 1; currentDay <= targetDay; currentDay += 1) {
      const random = seededRandom(seed + currentDay * 7919);
      for (const resource of resources) {
        const pool = pools[resource.id]!;
        let desiredConsumption = 0;
        for (const market of markets) {
          const entry = market.entries[resource.id];
          if (!entry || market.produces.has(resource.id)) continue;
          const base = market.needs.has(resource.id) ? 2.2 : 0.35;
          desiredConsumption += Math.min(
            quantity(entry.stock),
            Math.max(0, Math.floor(base + random() * base))
          );
        }

        consumeToReserve(resource.id, desiredConsumption, markets, pool, random);
        produceFromReserve(resource.id, markets, pool, random);

        for (const market of markets) {
          driftDemand(market, resource.id, random);
          marketsService.recalculate(market.locationId, resource.id);
        }

        if (resource.legality === 'illegal') {
          illegalStabilization(resource.id, markets, player, pool);
        } else {
          legalStabilization(resource.id, markets, player, pool);
        }
      }
    }

    lastDay = targetDay;
  };

  return {
    pools,
    getResourceTotal(resourceId) {
      const pool = pools[resourceId];
      return pool ? totalResource(resourceId, markets, player, pool) : 0;
    },
    advanceDay,
    advanceNextDay() {
      advanceDay(lastDay + 1);
    },
  };
}
