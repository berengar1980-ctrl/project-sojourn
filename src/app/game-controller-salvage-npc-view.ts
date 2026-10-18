import { getShipDefinition } from '../systems/ships';
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
