import {
  stageNpcPopulationCheckpoint,
  type NpcPopulationCheckpoint,
} from './npc-population-checkpoint';
import type { EconomyMarketService } from '../economy/market-service';
import type { SectorNpcState } from '../../core/npc-types';
import { getShipDefinition, resolveShipGameplayStats, shipPurchasePrice } from '../ships';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { npcWorkingCapital } from '../economy/npc-operating-decisions';
import { hashId } from './npc-sector-routing';

/** Pre-funded civilian insurance pool; receipts are actual withheld NPC trade commissions. */
const INITIAL_FUND = 12000000;

function replacementDelay(npc: SectorNpcState): number {
  const roll = hashId(npc.id + ':' + (npc.replacementGeneration ?? 0));
  if (npc.pirate) return 1 + (roll % 4);
  if (npc.job === 'patrol') return 3 + (roll % 8);
  return 5 + (roll % 11);
}

function refinance(npc: SectorNpcState, day: number): number {
  const minimum = npcWorkingCapital(npc);
  if (npc.pirate || minimum <= 0 || npc.credits >= minimum) {
    delete npc.insolventSinceDay;
    return 0;
  }
  if (npc.travel || npc.combatMovement || npc.activity?.startsWith('Straflager')) return 0;
  npc.insolventSinceDay ??= day;
  if (day - npc.insolventSinceDay < 3) return 0;
  const funding = Math.max(0, Math.ceil(minimum * 3 - npc.credits));
  npc.credits += funding;
  npc.refinancingCredits = (npc.refinancingCredits ?? 0) + funding;
  delete npc.insolventSinceDay;
  return funding;
}

function returnRetiredCargo(
  npc: SectorNpcState,
  original: SectorNpcState,
  markets: EconomyMarketService,
  recordLoss: (id: string, units: number) => void
): void {
  // Goods do not vanish when a company closes: recovered cargo is deposited
  // in actual markets, or recorded as an explicit circulation loss.
  for (const [resourceId, units] of Object.entries(npc.cargo)) {
    const amount = Math.max(0, Math.floor(units));
    if (!amount) continue;
    const preferred = original.homePortId ?? original.locationId;
    const market =
      markets
        .snapshot()
        .find((item) => item.locationId === preferred && item.entries[resourceId]) ??
      markets.snapshot().find((item) => item.entries[resourceId]);
    if (market) {
      market.entries[resourceId]!.stock += amount;
      markets.recalculate(market.locationId, resourceId);
    } else {
      recordLoss(resourceId, amount);
    }
  }
}

export interface NpcPopulationService {
  exportState(): NpcPopulationCheckpoint;
  readonly replacementCount: number;
  readonly outstanding: number;
  readonly fundCredits: number;
  readonly externalFunding: number;
  collectTradeCommission(credits: number): void;
  scheduleDefeated(npc: SectorNpcState, day: number): boolean;
  advanceDay(day: number): void;
}

export function createNpcPopulationService(
  npcs: readonly SectorNpcState[],
  markets: EconomyMarketService,
  recordLoss: (id: string, units: number) => void = () => {},
  checkpoint?: NpcPopulationCheckpoint
): NpcPopulationService {
  const templates = new Map(createSectorNpcEconomyStates().map((npc) => [npc.id, npc]));
  const restored = checkpoint ? stageNpcPopulationCheckpoint(checkpoint) : null;
  let fund = restored?.fundCredits ?? INITIAL_FUND;
  let replacementCount = restored?.replacementCount ?? 0;
  let externalFunding = restored?.externalFunding ?? 0;
  const restore = (npc: SectorNpcState): boolean => {
    const original = templates.get(npc.id);
    if (!original) return false;
    const ship = getShipDefinition(original.shipId);
    if (!ship) return false;
    const capital = Math.max(300000, npcWorkingCapital(original) * 3);
    const cost = shipPurchasePrice(ship) + capital;
    returnRetiredCargo(npc, original, markets, recordLoss);
    const insured = original.pirate || original.job === 'patrol' ? 0 : Math.min(fund, cost);
    externalFunding += cost - insured;
    fund -= insured;
    const generation = (npc.replacementGeneration ?? 0) + 1;
    const previousCapital = npc.replacementCapitalSpent ?? 0;
    const previousRefinancing = npc.refinancingCredits ?? 0;
    const key = npc.id;
    for (const field of Object.keys(npc)) delete (npc as unknown as Record<string, unknown>)[field];
    Object.assign(npc, original, {
      id: key,
      name: original.name + ' · Nachfolger ' + generation,
      credits: capital,
      cargo: {},
      marketIntel: {},
      successfulRuns: 0,
      replacementGeneration: generation,
      replacementCapitalSpent: previousCapital + cost,
      refinancingCredits: previousRefinancing,
      hullMaxHp: resolveShipGameplayStats(ship).hullPoints,
      hullHp: resolveShipGameplayStats(ship).hullPoints,
    });
    replacementCount += 1;
    return true;
  };
  return {
    exportState: () => ({
      version: 1,
      fundCredits: fund,
      replacementCount,
      ...(externalFunding > 0 ? { externalFunding } : {}),
    }),
    get externalFunding() {
      return externalFunding;
    },
    get fundCredits() {
      return fund;
    },
    get replacementCount() {
      return replacementCount;
    },
    get outstanding() {
      return npcs.filter((npc) => npc.retiredUntilDay !== undefined).length;
    },
    collectTradeCommission(credits) {
      if (Number.isFinite(credits) && credits > 0) fund += Math.floor(credits);
    },
    scheduleDefeated(npc, day) {
      if (npc.retiredUntilDay !== undefined || !templates.has(npc.id)) return false;
      npc.retiredUntilDay = Math.max(0, Math.floor(day)) + replacementDelay(npc);
      delete npc.travel;
      delete npc.combatMovement;
      npc.hullHp = 0;
      npc.activityId = 'retired';
      npc.activity = 'Verlust · Neuregistrierung frühestens Tag ' + npc.retiredUntilDay;
      return true;
    },
    advanceDay(day) {
      for (const npc of npcs) {
        if (npc.retiredUntilDay !== undefined) {
          if (day >= npc.retiredUntilDay) restore(npc);
        } else {
          externalFunding += refinance(npc, day);
        }
      }
    },
  };
}
