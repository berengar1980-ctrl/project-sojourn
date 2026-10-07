import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation } from '../core/world-types';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import type { NpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import { getShipDefinition } from '../systems/ships';

function requireLocalSpace(service: LocalSpaceService | null): LocalSpaceService {
  if (!service) throw new Error('Local space is not active.');
  return service;
}

// prettier-ignore
function createActiveLocalModel(
  service: LocalSpaceService | null,
  ship: ShipDefinition,
  locationName: string,
  npcMining: NpcLocalMiningService | null
) {
  const npcShips = (npcMining?.ships ?? []).flatMap((npc) => {
    const definition = getShipDefinition(npc.shipId);
    if (!definition) return [];
    return [
      {
        id: npc.npcId,
        name: npc.name,
        position: npc.position,
        headingRadians: npc.headingRadians,
        speed: npc.speed,
        phase: npc.phase,
        targetAsteroidId: npc.targetAsteroidId,
        laserActive: npc.laserActive,
        scanProgress: npc.scanProgress,
        nominalLengthMeters: definition.nominalLengthMeters,
        spriteUrl: definition.sprite.assetUrl,
        spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
        hardpoints: definition.sprite.hardpoints,
      },
    ];
  });

  return createLocalSpaceViewModel(
    requireLocalSpace(service).getSnapshot(),
    ship,
    locationName + ' // Mining',
    npcShips
  );
}

export function miningLocationById(locationId: string | null): WorldLocation | null {
  if (!locationId) return null;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  return location?.activities.mine ? location : null;
}

export function salvageLocationById(locationId: string | null): WorldLocation | null {
  if (!locationId) return null;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  return location?.activities.salvage ? location : null;
}

export function createControllerLocalModel(
  service: LocalSpaceService | null,
  ship: ShipDefinition,
  navigation: NavigationService,
  npcMining: NpcLocalMiningService | null
) {
  const locationName = miningLocationById(navigation.getSnapshot().currentLocationId)?.name;
  return createActiveLocalModel(service, ship, locationName ?? 'Mining Zone', npcMining);
}
