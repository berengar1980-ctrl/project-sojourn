import type { SalvageField } from '../core/salvage-types';
import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation } from '../core/world-types';
import type { SectorNpcState } from '../core/npc-types';
import type { NpcEconomyService } from '../systems/economy/npc-economy-service';
import {
  createNpcLocalSalvageService,
  type NpcLocalSalvageService,
} from '../systems/npcs/npc-local-salvage-service';
import type { SalvageLocalSpaceService } from '../systems/salvage/salvage-local-space-service';

interface SalvageNpcRuntimeOptions {
  readonly location: WorldLocation;
  readonly sectorNpcs: readonly SectorNpcState[];
  readonly npcEconomy: NpcEconomyService;
  readonly ship: ShipDefinition;
}

export function createNpcSalvageRuntime(
  options: SalvageNpcRuntimeOptions,
  field: SalvageField,
  service: SalvageLocalSpaceService
): NpcLocalSalvageService {
  return createNpcLocalSalvageService({
    locationId: options.location.id,
    field,
    salvagers: options.sectorNpcs.filter(
      (npc) => npc.job === 'salvager' && npc.workLocationId === options.location.id
    ),
    recover: (npc, resourceId, requested) =>
      options.npcEconomy.salvageLocal(npc, resourceId, requested),
    depart: (npc) => options.npcEconomy.dispatchLoadedWorker(npc),
    playerShip: options.ship,
    getPlayerShipState: () => service.getSnapshot().ship,
    onPlayerShieldContact: (normal, overlap) => service.recordShipShieldContact(normal, overlap),
  });
}
