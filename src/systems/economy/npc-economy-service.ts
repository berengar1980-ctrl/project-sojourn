import type { EconomyResourceDefinition, NpcEconomyState } from '../../core/economy-types';

import {
  advanceNpcAutonomyTimer,
  beginNpcAutonomyPhase,
  clearNpcPendingTravel,
  ensureNpcAutonomy,
  ensureNpcPersonality,
  markNpcArrival,
  markNpcTravelStarted,
} from '../npcs/npc-autonomy';

import type { EconomyMarketService } from './market-service';

import { type EconomyPoint } from './npc-resource-side-trade';

import type {
  NpcEconomyServiceOptions,
  PhysicalResourceAllocator,
  NpcEconomyService,
  NpcEconomyCheckpoint,
} from './npc-economy-types';

import {
  buyFromMarket,
  beginRest,
  sellToMarket,
  chooseTraderAction,
  chooseWorkerAction,
  handleCargoSale,
  npcNetSaleUnitPrice,
} from './npc-trade-actions';

import { observeNpcMarket, initializeNpcMarketIntel } from './npc-market-knowledge';

import { npcCargoUsed, cargoFree, quantity } from './npc-cargo';
import { maxAffordableShipment } from './npc-operating-decisions';
import { chargeNpcDailyOperatingExpenses } from './npc-operating-expenses';
import { finishNpcWorksite } from './npc-work-planning';

export { npcCargoUsed } from './npc-cargo';

export { observeNpcMarket } from './npc-market-knowledge';

export { npcMarketIntelAge } from './npc-market-knowledge';

export { npcKnownMarketIds } from './npc-market-knowledge';

export type { NpcEconomyService } from './npc-economy-types';

export type { NpcEconomyServiceOptions } from './npc-economy-types';

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

function completeLoading(
  npc: NpcEconomyState,
  markets: EconomyMarketService,
  day: number,
  options: NpcEconomyServiceOptions
): void {
  const autonomy = ensureNpcAutonomy(npc);
  const pending = autonomy.pendingTrade;
  if (!pending) {
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }

  if (options.canTrade?.(npc, pending.destinationId, pending.resourceId) === false) {
    delete autonomy.pendingTrade;
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }
  const capacity =
    npc.sideTradePlan && pending.reason === 'Nebenhandel'
      ? (npc.normalCargoCapacity ?? npc.cargoCapacity)
      : npc.cargoCapacity;
  const unitPrice = markets.getEntry(npc.locationId, pending.resourceId)?.price ?? 0;
  const fundedQuantity =
    unitPrice > 0
      ? maxAffordableShipment(
          npc,
          pending.destinationId,
          pending.quantity,
          unitPrice,
          options.travel?.quoteTravel
        )
      : 0;
  const moved = buyFromMarket(
    npc,
    markets,
    npc.locationId,
    pending.resourceId,
    fundedQuantity,
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
  day: number,
  options: NpcEconomyServiceOptions
): void {
  const autonomy = ensureNpcAutonomy(npc);
  const resourceId = autonomy.pendingSaleResourceId;
  if (!resourceId) {
    beginRest(npc);
    return;
  }

  if (options.canTrade?.(npc, npc.locationId, resourceId) === false) {
    delete npc.sideTradePlan;
    delete autonomy.pendingSaleResourceId;
    beginNpcAutonomyPhase(npc, 'thinking');
    return;
  }
  const requested =
    npc.sideTradePlan?.resourceId === resourceId
      ? npc.sideTradePlan.quantity
      : Number.POSITIVE_INFINITY;
  const price = markets.getEntry(npc.locationId, resourceId)?.price ?? 0;
  const moved = sellToMarket(npc, markets, npc.locationId, resourceId, day, requested);
  if (moved > 0) options.onSale?.(npc, resourceId, moved, moved * npcNetSaleUnitPrice(npc, price));
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
    if (options.workPlanning && destinationId === npc.workLocationId) finishNpcWorksite(npc);
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
    chooseTraderAction(npc, markets, resources, positions, day, options.travel?.quoteTravel);
    return;
  }
  if (npc.role === 'miner' || npc.role === 'salvager') {
    chooseWorkerAction(
      npc,
      markets,
      resources,
      positions,
      day,
      options.travel?.quoteTravel,
      options.workPlanning
    );
    return;
  }
  if (npc.role === 'patrol') {
    const pirate = 'pirate' in npc && npc.pirate;
    if (!pirate && handleCargoSale(npc, positions, day, options.travel?.quoteTravel)) return;
    const accepted = options.travel?.requestPatrol?.(npc) ?? false;
    if (accepted) markNpcTravelStarted(npc);
    else beginNpcAutonomyPhase(npc, 'patrol-rest');
    return;
  }
  beginRest(npc);
}

function advanceWorkingPhase(npc: NpcEconomyState, options: NpcEconomyServiceOptions): void {
  const misplaced = options.workPlanning && npc.workLocationId !== npc.locationId;
  if (misplaced || npcCargoUsed(npc) >= Math.max(1, Math.floor(npc.cargoCapacity))) {
    if (options.workPlanning) finishNpcWorksite(npc);
    beginNpcAutonomyPhase(npc, 'thinking');
  }
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

  if (
    autonomy.wasTravelling ||
    autonomy.phase === 'travel' ||
    autonomy.lastLocationId !== npc.locationId
  ) {
    markNpcArrival(npc);
    observeNpcMarket(npc, markets, npc.locationId, day);
    return;
  }

  if (autonomy.phase === 'working') {
    advanceWorkingPhase(npc, options);
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
    completeUnloading(npc, markets, day, options);
  } else if (autonomy.phase === 'resting') {
    beginNpcAutonomyPhase(npc, 'thinking');
  } else if (autonomy.phase === 'thinking') {
    beginNpcAutonomyPhase(npc, 'ready', 0);
    chooseReadyAction(npc, markets, resources, positions, day, options);
  } else if (autonomy.phase === 'loading') {
    completeLoading(npc, markets, day, options);
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
  day: number,
  options: NpcEconomyServiceOptions
): void {
  const autonomy = ensureNpcAutonomy(npc);
  if (autonomy.phase !== 'working') return;
  if (npc.workLocationId && npc.locationId !== npc.workLocationId) return;
  if (npc.role === 'salvager' && options.physicalSalvageWorker) {
    options.physicalSalvageWorker(npc, day);
    return;
  }

  const candidates = npc.workResourceIds;
  if (candidates.length === 0) return;
  const resourceId = candidates[day % candidates.length]!;
  const base = Math.min(cargoFree(npc), npc.role === 'miner' ? 8 : 5);
  const wanted =
    npc.role === 'miner' ? (options.miningAllowance?.(npc, resourceId, base) ?? base) : base;
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
    if (npc.role === 'miner') options.onMined?.(npc, resourceId, allocated);
  }
  if (cargoFree(npc) <= 0) beginNpcAutonomyPhase(npc, 'thinking');
}

function validateNpcEconomyCheckpoint(
  checkpoint: NpcEconomyCheckpoint,
  npcs: readonly NpcEconomyState[]
): void {
  if (
    checkpoint.version !== 1 ||
    !Number.isSafeInteger(checkpoint.lastDay) ||
    checkpoint.lastDay < -1 ||
    !Array.isArray(checkpoint.npcIds) ||
    checkpoint.npcIds.length !== npcs.length
  ) {
    throw new Error('Invalid NPC economy checkpoint');
  }
  const known = new Set(npcs.map((npc) => npc.id));
  if (
    known.size !== npcs.length ||
    new Set(checkpoint.npcIds).size !== checkpoint.npcIds.length ||
    checkpoint.npcIds.some((id) => !known.has(id))
  ) {
    throw new Error('NPC economy checkpoint identity mismatch');
  }
}

function initializeNpcEconomy(
  npcs: readonly NpcEconomyState[],
  markets: EconomyMarketService,
  positions: Readonly<Record<string, EconomyPoint>>
): void {
  for (const npc of npcs) {
    initializeNpcMarketIntel(npc, markets, positions, 0);
    if ('smuggler' in npc && npc.smuggler) {
      for (const locationId of [
        'blackjaw-outpost',
        'gallows-anchor',
        'crown',
        'eidolon',
        'aurora',
      ]) {
        observeNpcMarket(npc, markets, locationId, 0);
      }
    }
    const personality = ensureNpcPersonality(npc);
    ensureNpcAutonomy(npc);
    const sectorNpc = npc as NpcEconomyState & { workRiskPreference?: 'safe' | 'risky' };
    if (sectorNpc.workRiskPreference !== undefined) {
      sectorNpc.workRiskPreference = personality.riskTolerance >= 0.55 ? 'risky' : 'safe';
    }
  }
}

function processNpcEconomyDay(
  npc: NpcEconomyState,
  current: number,
  markets: EconomyMarketService,
  allocator: PhysicalResourceAllocator,
  options: NpcEconomyServiceOptions
): void {
  if ('retiredUntilDay' in npc && npc.retiredUntilDay !== undefined) return;
  // Security drones and prisoners do not accrue regular ship operating expenses.
  if (
    npc.id.startsWith('security-drone:') ||
    ('activity' in npc && typeof npc.activity === 'string' && npc.activity.startsWith('Straflager'))
  ) {
    return;
  }
  if (!('pirate' in npc && npc.pirate)) chargeNpcDailyOperatingExpenses(npc, current);
  if (options.travel?.isTravelling(npc)) return;
  if (Object.keys(npc.marketIntel ?? {}).length === 0) {
    initializeNpcMarketIntel(npc, markets, options.positions ?? {}, current);
  } else {
    observeNpcMarket(npc, markets, npc.locationId, current);
  }
  if ((npc.role === 'miner' || npc.role === 'salvager') && !options.isManaged?.(npc)) {
    abstractWorkerDay(npc, allocator, current, options);
  }
}

export function createNpcEconomyService(
  markets: EconomyMarketService,
  allocator: PhysicalResourceAllocator,
  resources: readonly EconomyResourceDefinition[],
  npcs: readonly NpcEconomyState[],
  options: NpcEconomyServiceOptions = {},
  checkpoint?: NpcEconomyCheckpoint
): NpcEconomyService {
  if (checkpoint) validateNpcEconomyCheckpoint(checkpoint, npcs);
  let lastDay = checkpoint?.lastDay ?? -1;
  let dailyOptions = options;
  const positions = options.positions ?? {};
  if (!checkpoint) initializeNpcEconomy(npcs, markets, positions);

  const advanceDay = (day: number): void => {
    const target = Math.max(0, Math.floor(day));
    if (target <= lastDay) return;

    for (let current = lastDay + 1; current <= target; current += 1) {
      for (const npc of npcs) {
        processNpcEconomyDay(npc, current, markets, allocator, dailyOptions);
      }
    }
    lastDay = target;
  };

  return {
    exportState() {
      return {
        version: 1,
        lastDay,
        npcIds: npcs.map((npc) => npc.id),
      };
    },
    npcs,
    mineLocal(npc, resourceId, requestedQuantity, sourceId) {
      beginNpcAutonomyPhase(npc, 'working', 0);
      const wanted = Math.min(
        quantity(requestedQuantity),
        cargoFree(npc),
        options.miningAllowance?.(npc, resourceId, requestedQuantity) ?? requestedQuantity
      );
      if (wanted <= 0) return 0;
      const stock = sourceId ? allocator.getPhysicalStock?.(resourceId, sourceId) : undefined;
      const allocated =
        sourceId && stock !== undefined && allocator.withdrawPhysicalStock
          ? allocator.withdrawPhysicalStock(resourceId, sourceId, wanted)
          : allocator.createMinedResource(resourceId, wanted);
      if (allocated <= 0) return 0;
      options.onMined?.(npc, resourceId, allocated);
      npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
      return allocated;
    },
    salvageLocal(npc, resourceId, requestedQuantity, sourceId) {
      beginNpcAutonomyPhase(npc, 'working', 0);
      const wanted = Math.min(quantity(requestedQuantity), cargoFree(npc));
      if (wanted <= 0) return 0;
      const stock = sourceId ? allocator.getPhysicalStock?.(resourceId, sourceId) : undefined;
      const allocated =
        sourceId && stock !== undefined && allocator.withdrawPhysicalStock
          ? allocator.withdrawPhysicalStock(resourceId, sourceId, wanted)
          : allocator.allocatePhysicalResource(resourceId, wanted);
      if (allocated <= 0) return 0;
      npc.cargo[resourceId] = quantity(npc.cargo[resourceId] ?? 0) + allocated;
      return allocated;
    },
    setWorkPlanning(planning) {
      dailyOptions = { ...dailyOptions, workPlanning: planning };
    },
    setPhysicalSalvageWorker(worker) {
      dailyOptions = { ...dailyOptions, physicalSalvageWorker: worker };
    },
    dispatchLoadedWorker(npc) {
      if (dailyOptions.workPlanning) finishNpcWorksite(npc);
      else if (npcCargoUsed(npc) <= 0) return false;
      clearNpcPendingTravel(npc);
      beginNpcAutonomyPhase(npc, 'thinking');
      return true;
    },
    tick(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const dt = Math.min(deltaSeconds, 0.25);
      for (const npc of npcs) {
        if ('retiredUntilDay' in npc && npc.retiredUntilDay !== undefined) continue;
        if (dailyOptions.isManaged?.(npc)) continue;
        const day = Math.max(0, lastDay);
        advanceNpcActivity(npc, dt, markets, resources, positions, day, dailyOptions);
      }
    },
    advanceDay,
    advanceNextDay() {
      advanceDay(lastDay + 1);
    },
  };
}
