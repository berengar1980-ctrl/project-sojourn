import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';
import { npcOperationalRoleAllowed } from '../systems/operations/ship-operation-permissions';
import type { SalvageField } from '../core/salvage-types';
import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation, WorldPoint } from '../core/world-types';
import type { SectorNpcState } from '../core/npc-types';
import type { NpcEconomyService } from '../systems/economy/npc-economy-service';
import {
  createNpcLocalSalvageService,
  type NpcLocalSalvageService,
} from '../systems/npcs/npc-local-salvage-service';
import type { SalvageLocalSpaceService } from '../systems/salvage/salvage-local-space-service';

interface SalvageNpcRuntimeOptions {
  readonly location: WorldLocation;
  readonly spawnPositions?: ReadonlyMap<string, WorldPoint>;
  readonly sectorNpcs: readonly SectorNpcState[];
  readonly npcEconomy: NpcEconomyService;
  readonly ship: ShipDefinition;
  readonly wreckClaims: WreckClaimRegistry;
  readonly getCurrentDay: () => number;
}

export function createNpcSalvageRuntime(
  options: SalvageNpcRuntimeOptions,
  field: SalvageField,
  service: SalvageLocalSpaceService
): NpcLocalSalvageService {
  return createNpcLocalSalvageService({
    locationId: options.location.id,
    field,
    initialPosition: (id) => options.spawnPositions?.get(id),
    get salvagers() {
      return options.sectorNpcs.filter(
        (npc) =>
          npcOperationalRoleAllowed(npc, 'salvage') && npc.workLocationId === options.location.id
      );
    },
    canWorkWreck: (npc, wreck) => {
      const claim = options.wreckClaims.claim(field.id, wreck.id, options.getCurrentDay());
      return !claim || claim.ownerId === npc.id;
    },
    registerWreck: (npc, wreck) => {
      if (wreck.combatWreckVariant) return true;
      const claim = options.wreckClaims.claim(field.id, wreck.id, options.getCurrentDay());
      if (claim) return claim.ownerId === npc.id;
      const result = options.wreckClaims.register(
        field,
        wreck,
        npc.id,
        options.getCurrentDay(),
        npc.credits
      );
      if (!result.ok) return false;
      npc.credits -= result.fee;
      return true;
    },
    recover: (npc, resourceId, requested) =>
      options.npcEconomy.salvageLocal(npc, resourceId, requested),
    depart: (npc) => options.npcEconomy.dispatchLoadedWorker(npc),
    playerShip: options.ship,
    getPlayerShipState: () => service.getSnapshot().ship,
    onPlayerShieldContact: (normal, overlap) => service.recordShipShieldContact(normal, overlap),
  });
}
