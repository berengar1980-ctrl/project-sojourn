import type { ShipComponentInventoryService } from './ship-component-inventory-service';
import type { ShipLoadoutService } from './ship-loadout-service';
import type { ShipOwnershipService } from './ship-ownership-service';
import type { ShipyardResearchService } from './shipyard-research-service';

// Pure in-memory boundary for a future save format. No storage, loading, or migrations.
export interface ShipProgressionSnapshot {
  readonly activeShipId: string;
  readonly ownedShipIds: readonly string[];
  readonly loadouts: ReturnType<ShipLoadoutService['snapshot']>;
  readonly inventory: ReturnType<ShipComponentInventoryService['snapshot']>;
  readonly discoveredBonuses: ReturnType<ShipyardResearchService['snapshot']>;
}

export function createShipProgressionSnapshot(
  activeShipId: string,
  ownership: ShipOwnershipService,
  loadouts: ShipLoadoutService,
  inventory: ShipComponentInventoryService,
  research: ShipyardResearchService
): ShipProgressionSnapshot {
  return {
    activeShipId,
    ownedShipIds: ownership.snapshot().ownedShipIds,
    loadouts: loadouts.snapshot(),
    inventory: inventory.snapshot(),
    discoveredBonuses: research.snapshot(),
  };
}
