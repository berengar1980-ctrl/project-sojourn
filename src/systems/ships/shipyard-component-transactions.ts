import type { ShipComponentType, ShipDefinition } from '../../core/ship-types';
import type { PlayerTradeService } from '../economy/player-trade-service';
import {
  getCompatibleShipComponents,
  getShipComponent,
  salvagedComponentAppraisal,
} from './ship-component-service';
import type { ShipComponentInventoryService } from './ship-component-inventory-service';
import type { ShipLoadoutService } from './ship-loadout-service';
import { shipCanFitWeapon } from './ship-loadout-service';
import { resolveShipGameplayStats } from './ship-stats';
import type { ShipyardResearchService } from './shipyard-research-service';

export interface ShipyardTransactionContext {
  readonly ship: ShipDefinition;
  readonly trade: PlayerTradeService;
  readonly inventory: ShipComponentInventoryService;
  readonly loadouts: ShipLoadoutService;
  readonly research: ShipyardResearchService;
  readonly cargoCapacityTons: number;
  readonly locationId: string;
}

export interface ShipyardComponentSale {
  readonly name: string;
  readonly credits: number;
  readonly researched: boolean;
}

export function purchaseShipyardComponent(
  context: ShipyardTransactionContext,
  type: ShipComponentType,
  componentId: string
): boolean {
  const { ship, inventory, research, trade, cargoCapacityTons, locationId } = context;
  const component = getShipComponent(type, componentId);
  const maxTier = type === 'armor' ? 6 : resolveShipGameplayStats(ship).maxComponentTier;
  if (!component || component.tier > maxTier || component.cost < 0) return false;
  const standard = getCompatibleShipComponents(type, maxTier).some(
    (entry) => entry.id === componentId
  );
  const unlocked = research.variants(type, maxTier).some((entry) => entry.id === componentId);
  if (!standard && !unlocked) return false;
  if (type === 'weapon' && (!component.weapon || !shipCanFitWeapon(ship, component.weapon))) {
    return false;
  }
  if (trade.player.credits < component.cost) return false;

  // Reserve inventory capacity before charging; roll back if a concurrent debit fails.
  const stored = inventory.store(
    type,
    componentId,
    'shipyard-' + locationId,
    cargoCapacityTons,
    'purchased'
  );
  if (!stored) return false;
  if (component.cost > 0 && !trade.takeCredits(component.cost)) {
    inventory.take(stored.uid);
    return false;
  }
  return true;
}

export function sellShipyardComponent(
  context: ShipyardTransactionContext,
  uid: string
): ShipyardComponentSale | null {
  const item = context.inventory.list().find((component) => component.uid === uid);
  if (!item) return null;
  const appraisal = salvagedComponentAppraisal(item.type, item.componentId);
  const definition = getShipComponent(item.type, item.componentId);
  if (appraisal.sell <= 0 || !definition) return null;
  if (!Number.isSafeInteger(context.trade.player.credits)) return null;
  if (context.trade.player.credits > Number.MAX_SAFE_INTEGER - appraisal.sell) return null;
  if (!context.inventory.take(uid)) return null;
  if (!context.trade.grantCredits(appraisal.sell)) {
    context.inventory.store(
      item.type,
      item.componentId,
      item.sourceWreckId,
      context.cargoCapacityTons,
      item.source
    );
    return null;
  }
  return {
    name: definition.name,
    credits: appraisal.sell,
    researched: context.research.registerComponent(item.type, item.componentId),
  };
}

type LoosePart = ReturnType<ShipComponentInventoryService['take']>;

function rollbackComponentInstall(
  context: ShipyardTransactionContext,
  type: ShipComponentType,
  taken: LoosePart,
  removed: LoosePart
): void {
  if (removed) context.inventory.take(removed.uid);
  if (!taken) return;
  context.inventory.store(
    type,
    taken.componentId,
    taken.sourceWreckId,
    context.cargoCapacityTons,
    taken.source
  );
}

function exchangeInstalledComponent(
  context: ShipyardTransactionContext,
  type: ShipComponentType,
  index: number,
  oldId: string | null,
  selected: LoosePart
): boolean {
  const { ship, inventory, loadouts, cargoCapacityTons } = context;
  const taken = selected ? inventory.take(selected.uid) : null;
  if (selected && !taken) return false;
  const removed = oldId
    ? inventory.store(type, oldId, 'removed-' + ship.id, cargoCapacityTons, 'removed')
    : null;
  if (oldId && !removed) {
    rollbackComponentInstall(context, type, taken, removed);
    return false;
  }
  if (!loadouts.setSlot(ship, type, index, selected?.componentId ?? null)) {
    rollbackComponentInstall(context, type, taken, removed);
    return false;
  }
  return true;
}

export function installShipyardComponent(
  context: ShipyardTransactionContext,
  type: ShipComponentType,
  index: number,
  uid: string | null
): boolean {
  const { ship, inventory, loadouts } = context;
  const selected = uid ? inventory.list().find((item) => item.uid === uid) : null;
  if (uid && (!selected || selected.type !== type)) return false;
  const componentId = selected?.componentId ?? null;
  if (!loadouts.canSetSlot(ship, type, index, componentId)) return false;
  const before = loadouts.get(ship)[type]?.[index] ?? null;
  if (before === componentId) return false;
  return exchangeInstalledComponent(context, type, index, before, selected);
}
