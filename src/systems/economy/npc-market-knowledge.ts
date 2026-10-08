import type {
  EconomyMarketState,
  NpcEconomyState,
  NpcMarketIntelLocation,
} from '../../core/economy-types';

import { ensureNpcPersonality } from '../npcs/npc-autonomy';

import type { EconomyMarketService } from './market-service';

import { type EconomyPoint, type NpcTradeMarketView } from './npc-resource-side-trade';

import { quantity } from './npc-cargo';

const INITIAL_TRADER_REMOTE_MARKETS = 5;

const INITIAL_WORKER_REMOTE_MARKETS = 4;

const INITIAL_PATROL_REMOTE_MARKETS = 2;

function hashText(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

export function npcKnownMarketViews(npc: NpcEconomyState): readonly NpcTradeMarketView[] {
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

export function initializeNpcMarketIntel(
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
      const preferred = knownRemote[hashText(npc.id + ':preferred-market') % knownRemote.length];
      if (preferred) personality.preferredMarketId = preferred;
    }
  }
}
