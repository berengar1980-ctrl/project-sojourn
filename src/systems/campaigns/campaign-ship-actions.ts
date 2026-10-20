import type { ShipComponentType, ShipDefinition } from '../../core/ship-types';
import type { ShipComponentInventoryService } from '../ships/ship-component-inventory-service';
import type { ShipLoadoutService } from '../ships/ship-loadout-service';
import { getShipComponent } from '../ships/ship-component-service';
import { resolveShipGameplayStats } from '../ships/ship-stats';

export interface CampaignShipActions {
  grant(type: ShipComponentType, componentId: string): boolean;
  install(componentUid: string, slotIndex: number): boolean;
}

export function createCampaignShipActions(
  components: ShipComponentInventoryService,
  loadouts: ShipLoadoutService,
  getShip: () => ShipDefinition
): CampaignShipActions {
  return {
    grant(type, componentId) {
      if (!getShipComponent(type, componentId)) return false;
      const ship = getShip();
      return (
        components.store(
          type,
          componentId,
          'campaign',
          resolveShipGameplayStats(ship).cargoCapacityTons,
          'campaign'
        ) !== null
      );
    },
    install(componentUid, slotIndex) {
      if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) return false;
      const ship = getShip();
      const item = components.list().find((component) => component.uid === componentUid);
      if (!item) return false;
      const existing = loadouts.get(ship)[item.type]?.[slotIndex];
      if (existing) return false; // Never discard or overwrite installed equipment.
      if (!loadouts.setSlot(ship, item.type, slotIndex, item.componentId)) return false;
      const removed = components.take(item.uid);
      if (removed) return true;
      loadouts.setSlot(ship, item.type, slotIndex, null);
      return false;
    },
  };
}
