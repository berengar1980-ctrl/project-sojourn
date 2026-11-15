import type { PlayerEconomyState } from '../../core/economy-types';
import { stageCareerShipComponentInventory } from './ship-component-inventory-service';
import type { ShipComponentInventoryService } from './ship-component-inventory-service';
import { stageCareerShipLoadouts } from './ship-loadout-service';
import type { ShipLoadoutService } from './ship-loadout-service';
import { stageCareerShipOwnership } from './ship-ownership-service';
import type { ShipOwnershipService } from './ship-ownership-service';
import { stageCareerShipyardResearch } from './shipyard-research-service';
import type { ShipyardResearchService } from './shipyard-research-service';
import { getShipDefinition } from './ship-registry';

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

export interface StagedCareerShipProgression {
  readonly activeShipId: string;
  readonly ownership: ShipOwnershipService;
  readonly loadouts: ShipLoadoutService;
  readonly inventory: ShipComponentInventoryService;
  readonly research: ShipyardResearchService;
}

/** Stage all progression authorities together; the caller must not install a partial result. */
export function stageCareerShipProgression(
  snapshot: ShipProgressionSnapshot,
  starterShipId: string,
  player: PlayerEconomyState,
  wallet: Parameters<typeof stageCareerShipOwnership>[2]
): StagedCareerShipProgression {
  if (!snapshot || typeof snapshot.activeShipId !== 'string') {
    throw new Error('Invalid active ship checkpoint');
  }
  const ownership = stageCareerShipOwnership(
    { ownedShipIds: snapshot.ownedShipIds },
    starterShipId,
    wallet
  );
  if (!ownership.owns(snapshot.activeShipId)) {
    throw new Error('Active ship must be owned');
  }
  const loadouts = stageCareerShipLoadouts(
    snapshot.loadouts,
    snapshot.ownedShipIds,
    getShipDefinition
  );
  const inventory = stageCareerShipComponentInventory(snapshot.inventory, player);
  const research = stageCareerShipyardResearch(snapshot.discoveredBonuses);
  return { activeShipId: snapshot.activeShipId, ownership, loadouts, inventory, research };
}
