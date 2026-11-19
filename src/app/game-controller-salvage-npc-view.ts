import { getShipDefinition } from '../systems/ships';
import type { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { SectorNpcState } from '../core/npc-types';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';

export function salvageNpcShips(npcSalvage: NpcLocalSalvageService) {
  return npcSalvage.ships.flatMap((npc) => {
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
        targetWreckId: npc.targetWreckId,
        salvageActive: npc.salvageActive,
        scanProgress: npc.scanProgress,
        nominalLengthMeters: definition.nominalLengthMeters,
        spriteUrl: definition.sprite.assetUrl,
        spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
        hardpoints: definition.sprite.hardpoints,
      },
    ];
  });
}

/** Pirates in wreck fields use the same ship sprites and native local layer as salvagers. */
export function salvagePirateShips(
  traffic: LocalPirateTraffic,
  npcs: readonly SectorNpcState[]
) {
  return traffic.snapshot(npcs).flatMap((pirate) => {
    const definition = getShipDefinition(pirate.shipId);
    if (!definition) return [];
    return [{
      id: pirate.npcId,
      name: pirate.name,
      position: pirate.position,
      headingRadians: pirate.headingRadians,
      speed: pirate.speed,
      phase: 'approaching' as const,
      targetWreckId: null,
      salvageActive: false,
      scanProgress: 0,
      nominalLengthMeters: definition.nominalLengthMeters,
      spriteUrl: definition.sprite.assetUrl,
      spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
      hardpoints: definition.sprite.hardpoints,
    }];
  });
}
