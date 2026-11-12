import type { EconomyMarketService } from '../economy/market-service';
import type { SectorNpcState } from '../../core/npc-types';
import { getShipDefinition, resolveShipGameplayStats, shipPurchasePrice } from '../ships';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';

/** Pre-funded civilian insurance pool; receipts are actual withheld NPC trade commissions. */
const INITIAL_FUND = 12000000;
const REPLACEMENT_DELAY_DAYS = 5;
const SEED_CAPITAL = 300000;

export interface NpcPopulationService {
  readonly replacementCount: number;
  readonly outstanding: number;
  readonly fundCredits: number;
  collectTradeCommission(credits: number): void;
  scheduleDefeated(npc: SectorNpcState, day: number): boolean;
  advanceDay(day: number): void;
}

export function createNpcPopulationService(
  npcs: readonly SectorNpcState[],
  markets: EconomyMarketService,
  recordLoss: (id: string, units: number) => void = () => {}
): NpcPopulationService {
  const templates = new Map(createSectorNpcEconomyStates().map((npc) => [npc.id, npc]));
  let fund = INITIAL_FUND;
  let replacementCount = 0;
  const restore = (npc: SectorNpcState): boolean => {
    const original = templates.get(npc.id);
    if (!original || original.pirate || original.job === 'patrol') return false;
    const ship = getShipDefinition(original.shipId);
    if (!ship) return false;
    const cost = shipPurchasePrice(ship) + SEED_CAPITAL;
    if (fund < cost) return false;
    // Goods do not vanish when a company closes: recovered cargo is deposited
    // in actual markets, or recorded as an explicit circulation loss.
    for (const [resourceId, units] of Object.entries(npc.cargo)) {
      const amount = Math.max(0, Math.floor(units));
      if (!amount) continue;
      const entry =
        markets.getEntry(original.homePortId ?? original.locationId, resourceId) ??
        markets.snapshot().map((market) => markets.getEntry(market.locationId, resourceId)).find(Boolean);
      if (entry) {
        entry.stock += amount;
        markets.recalculate(entry === markets.getEntry(original.homePortId ?? original.locationId, resourceId) ? original.homePortId ?? original.locationId : markets.snapshot().find((market) => market.entries[resourceId] === entry)?.locationId ?? original.locationId, resourceId);
      } else recordLoss(resourceId, amount);
    }
    fund -= cost;
    const generation = (npc.replacementGeneration ?? 0) + 1;
    const key = npc.id;
    for (const field of Object.keys(npc)) delete (npc as unknown as Record<string, unknown>)[field];
    Object.assign(npc, original, {
      id: key,
      name: original.name + ' · Nachfolger ' + generation,
      credits: SEED_CAPITAL,
      cargo: {},
      marketIntel: {},
      successfulRuns: 0,
      replacementGeneration: generation,
      replacementCapitalSpent: (original.replacementCapitalSpent ?? 0) + cost,
      hullMaxHp: resolveShipGameplayStats(ship).hullPoints,
      hullHp: resolveShipGameplayStats(ship).hullPoints,
    });
    replacementCount += 1;
    return true;
  };
  return {
    get fundCredits() { return fund; },
    get replacementCount() { return replacementCount; },
    get outstanding() { return npcs.filter((npc) => npc.retiredUntilDay !== undefined).length; },
    collectTradeCommission(credits) {
      if (Number.isFinite(credits) && credits > 0) fund += Math.floor(credits);
    },
    scheduleDefeated(npc, day) {
      if (npc.retiredUntilDay !== undefined || npc.pirate || npc.job === 'patrol') return false;
      if ((npc.combatDefeats ?? 0) < 3 || npc.credits >= 500000) return false;
      npc.retiredUntilDay = Math.max(0, Math.floor(day)) + REPLACEMENT_DELAY_DAYS;
      delete npc.travel;
      delete npc.combatMovement;
      npc.hullHp = 0;
      npc.activityId = 'retired';
      npc.activity = 'Verlust · Neuregistrierung frühestens Tag ' + npc.retiredUntilDay;
      return true;
    },
    advanceDay(day) {
      for (const npc of npcs) {
        if (npc.retiredUntilDay !== undefined && day >= npc.retiredUntilDay) restore(npc);
      }
    },
  };
}
