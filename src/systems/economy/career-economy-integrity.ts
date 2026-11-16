import type {
  EconomyResourceDefinition,
  NpcEconomyState,
  PlayerEconomyState,
} from '../../core/economy-types';
import type { EconomyMarketService } from './market-service';

function finiteNonnegative(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validatePlayerCargo(player: PlayerEconomyState, resources: ReadonlySet<string>): void {
  if (!validQuantity(player.credits)) throw new Error('Invalid saved player credits');
  for (const [id, lot] of Object.entries(player.cargo)) {
    if (
      !resources.has(id) ||
      !lot ||
      !validQuantity(lot.qty) ||
      !validQuantity(lot.hiddenQty ?? 0) ||
      (lot.hiddenQty ?? 0) > lot.qty ||
      !finiteNonnegative(lot.totalCost)
    ) {
      throw new Error('Invalid saved player cargo');
    }
  }
}

function validateNpcCargo(
  npc: NpcEconomyState,
  resources: ReadonlySet<string>,
  locations: ReadonlySet<string>
): void {
  if (!locations.has(npc.locationId) || !validQuantity(npc.credits)) {
    throw new Error('Invalid saved NPC economy identity');
  }
  if (!validQuantity(npc.cargoCapacity)) throw new Error('Invalid saved NPC capacity');
  for (const [resourceId, amount] of Object.entries(npc.cargo)) {
    if (!resources.has(resourceId) || !validQuantity(amount)) {
      throw new Error('Invalid saved NPC cargo');
    }
  }
  for (const resourceId of npc.workResourceIds) {
    if (!resources.has(resourceId)) throw new Error('Unknown NPC work resource');
  }
}

function validatePendingTrade(
  npc: NpcEconomyState,
  resources: ReadonlySet<string>,
  locations: ReadonlySet<string>
): void {
  const autonomy = npc.autonomy;
  if (!autonomy) return;
  if (!locations.has(autonomy.lastLocationId)) {
    throw new Error('Unknown NPC autonomy location');
  }
  if (autonomy.pendingDestinationId && !locations.has(autonomy.pendingDestinationId)) {
    throw new Error('Unknown NPC trade destination');
  }
  if (autonomy.pendingSaleResourceId && !resources.has(autonomy.pendingSaleResourceId)) {
    throw new Error('Unknown NPC sale resource');
  }
  const pending = autonomy.pendingTrade;
  if (!pending) return;
  if (
    !resources.has(pending.resourceId) ||
    !locations.has(pending.destinationId) ||
    !validQuantity(pending.quantity) ||
    pending.quantity === 0 ||
    typeof pending.reason !== 'string'
  ) {
    throw new Error('Invalid saved NPC pending trade');
  }
}

function validateSideTrade(
  npc: NpcEconomyState,
  resources: ReadonlySet<string>,
  locations: ReadonlySet<string>
): void {
  const plan = npc.sideTradePlan;
  if (!plan) return;
  if (
    !resources.has(plan.resourceId) ||
    !locations.has(plan.sourceLocationId) ||
    !locations.has(plan.tradeLocationId) ||
    !locations.has(plan.workLocationId) ||
    !validQuantity(plan.quantity) ||
    !finiteNonnegative(plan.costBasis) ||
    !Number.isFinite(plan.expectedProfit) ||
    !finiteNonnegative(plan.extraDistance) ||
    !finiteNonnegative(plan.allowedExtraDistance)
  ) {
    throw new Error('Invalid saved NPC side trade');
  }
}

function validateNpcIntel(
  npc: NpcEconomyState,
  resources: ReadonlySet<string>,
  locations: ReadonlySet<string>
): void {
  if (!npc.marketIntel) return;
  for (const [locationId, observation] of Object.entries(npc.marketIntel)) {
    if (
      !locations.has(locationId) ||
      !observation ||
      observation.locationId !== locationId ||
      !validQuantity(observation.observedDay)
    ) {
      throw new Error('Invalid saved NPC market observation');
    }
    for (const [resourceId, entry] of Object.entries(observation.entries)) {
      if (
        !resources.has(resourceId) ||
        !entry ||
        entry.resourceId !== resourceId ||
        !validQuantity(entry.stock) ||
        !validQuantity(entry.price) ||
        entry.price === 0
      ) {
        throw new Error('Invalid saved NPC observed market price');
      }
    }
  }
}

/** Validate referential integrity before creating any new economy authorities. */
export function assertCareerEconomyIntegrity(
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  player: PlayerEconomyState,
  npcs: readonly NpcEconomyState[],
  worldLocations?: ReadonlySet<string>
): void {
  const resourceIds = new Set(resources.map((item) => item.id));
  const locationIds = new Set(markets.snapshot().map((item) => item.locationId));
  const validNpcLocations = worldLocations ?? locationIds;
  if (resourceIds.size !== resources.length) {
    throw new Error('Duplicate resource definitions');
  }
  validatePlayerCargo(player, resourceIds);
  const npcIds = new Set<string>();
  for (const npc of npcs) {
    if (!npc || typeof npc.id !== 'string' || !npc.id || npcIds.has(npc.id)) {
      throw new Error('Duplicate saved NPC economy identity');
    }
    npcIds.add(npc.id);
    validateNpcCargo(npc, resourceIds, validNpcLocations);
    validatePendingTrade(npc, resourceIds, validNpcLocations);
    validateSideTrade(npc, resourceIds, validNpcLocations);
    validateNpcIntel(npc, resourceIds, locationIds);
  }
}
