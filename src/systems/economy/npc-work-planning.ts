import type { EconomyResourceDefinition, NpcEconomyState } from '../../core/economy-types';
import { ensureNpcPersonality } from '../npcs/npc-autonomy';
import type { EconomyPoint } from './npc-resource-side-trade';
import type { NpcTravelQuoteFn } from './npc-operating-decisions';
import { npcMarketConfidence } from './npc-market-knowledge';

export interface NpcWorksite {
  readonly id: string;
  readonly role: 'miner' | 'salvager';
  readonly position: EconomyPoint;
  readonly danger: number;
  /** Public regional resource profile, not undiscovered asteroid contents. */
  readonly resourceIds: readonly string[];
}

export interface NpcWorkPlanning {
  readonly sites: readonly NpcWorksite[];
  readonly fleet: readonly NpcEconomyState[];
  readonly knownClaimValue?: (npc: NpcEconomyState, locationId: string) => number;
}

interface WorkCandidate {
  readonly site: NpcWorksite;
  readonly resourceIds: readonly string[];
  readonly score: number;
  readonly revenue: number;
}

function distance(a: EconomyPoint, b: EconomyPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Only personal market observations or published reference prices are used. */
export function knownWorkPrice(
  npc: NpcEconomyState,
  id: string,
  resources: readonly EconomyResourceDefinition[],
  day = 0
): number {
  const prices = Object.values(npc.marketIntel ?? {}).flatMap((market) => {
    const entry = market.entries[id];
    return entry ? [entry.price * npcMarketConfidence(market.observedDay, day)] : [];
  });
  if (prices.length) return Math.max(...prices);
  return resources.find((resource) => resource.id === id)?.basePrice ?? 0;
}

function marketDistance(
  npc: NpcEconomyState,
  site: NpcWorksite,
  positions: Readonly<Record<string, EconomyPoint>>
): number {
  const distances = Object.values(npc.marketIntel ?? {}).flatMap((market) => {
    const position = positions[market.locationId];
    return position && site.resourceIds.some((id) => market.entries[id])
      ? [distance(site.position, position)]
      : [];
  });
  return distances.length ? Math.min(...distances) : 1800;
}

function scoreSite(
  npc: NpcEconomyState,
  site: NpcWorksite,
  planning: NpcWorkPlanning,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  day: number
): WorkCandidate | null {
  const priced = site.resourceIds
    .map((id) => ({ id, price: knownWorkPrice(npc, id, resources, day) }))
    .filter((entry) => entry.price > 0)
    .sort((a, b) => b.price - a.price || a.id.localeCompare(b.id));
  if (!priced.length) return null;
  const origin = positions[npc.locationId] ?? site.position;
  const outbound = distance(origin, site.position);
  const roundTrip = outbound + marketDistance(npc, site, positions);
  const personality = ensureNpcPersonality(npc);
  const condition =
    'hullHp' in npc && 'hullMaxHp' in npc
      ? Number(npc.hullHp) / Math.max(1, Number(npc.hullMaxHp))
      : 1;
  const risk = Math.max(0, site.danger - 1);
  const riskFactor = risk * (1.9 - personality.riskTolerance);
  const riskPenalty = 1 + riskFactor / Math.max(0.3, condition);
  const rivals = planning.fleet.filter(
    (other) =>
      other.id !== npc.id &&
      other.workLocationId === site.id &&
      !('retiredUntilDay' in other && other.retiredUntilDay !== undefined)
  ).length;
  const expectedUnits = Math.min(npc.cargoCapacity, npc.role === 'miner' ? 40 : 20);
  const average = priced.reduce((sum, entry) => sum + entry.price, 0) / priced.length;
  const revenue = expectedUnits * average * 0.94;
  const fuelRate = 'fuelUse' in npc ? Math.max(0.1, Number(npc.fuelUse)) * 0.25 : 0.25;
  const net = revenue - roundTrip * fuelRate - 150;
  const claim = planning.knownClaimValue?.(npc, site.id) ?? 0;
  const repeat = npc.lastWorkLocationId === site.id ? 0.15 : 1;
  const benefit = (net + Math.min(revenue, claim) * 0.25) * repeat;
  const cost = (600 + roundTrip) * riskPenalty * (1 + rivals * 0.5);
  const score = benefit / cost;
  return { site, resourceIds: priced.map((entry) => entry.id), score, revenue };
}

/** Rank cheaply, then ask the real fuel-aware planner about shortlisted destinations. */
export function chooseNpcWorksite(
  npc: NpcEconomyState,
  planning: NpcWorkPlanning,
  resources: readonly EconomyResourceDefinition[],
  positions: Readonly<Record<string, EconomyPoint>>,
  quoteTravel?: NpcTravelQuoteFn,
  day = 0
): WorkCandidate | null {
  const ranked = planning.sites
    .filter((site) => site.role === npc.role)
    .flatMap((site) => {
      const candidate = scoreSite(npc, site, planning, resources, positions, day);
      return candidate && candidate.score > 0 ? [candidate] : [];
    })
    .sort((a, b) => b.score - a.score || a.site.id.localeCompare(b.site.id));
  for (const candidate of ranked) {
    if (candidate.site.id === npc.locationId || !quoteTravel) return candidate;
    const quote = quoteTravel(npc, candidate.site.id, npc.credits);
    if (quote && candidate.revenue > quote.fuelExpense) return candidate;
  }
  return null;
}

export function finishNpcWorksite(npc: NpcEconomyState): void {
  if (npc.workLocationId) npc.lastWorkLocationId = npc.workLocationId;
  delete npc.workLocationId;
  npc.workResourceIds = [];
}
