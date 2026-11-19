import type { SalvageField } from '../core/salvage-types';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import type { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { SalvageLocalSpaceService } from '../systems/salvage/salvage-local-space-service';
import { salvageFieldCombatArena } from '../systems/combat/field-combat-arena';
import type { SalvageSceneOptions } from './game-controller-salvage';

/** Reuse the native PvP arena for player attacks on salvagers and pirates. */
export function attackSalvageNpc(
  options: SalvageSceneOptions,
  field: SalvageField,
  service: SalvageLocalSpaceService,
  salvage: NpcLocalSalvageService,
  pirates: LocalPirateTraffic,
  id: string
): void {
  const target =
    salvage.ships.find((entry) => entry.npcId === id) ??
    pirates.snapshot(options.sectorNpcs).find((entry) => entry.npcId === id);
  if (!target) return;
  const playerShip = service.getSnapshot().ship;
  options.onAttackNpc?.(id, {
    ...salvageFieldCombatArena(field),
    attackerPosition: { ...playerShip.position },
    defenderPosition: { ...target.position },
    attackerHeadingRadians: playerShip.headingRadians,
    defenderHeadingRadians: target.headingRadians,
    defenderVelocity: {
      x: Math.cos(target.headingRadians) * target.speed,
      y: Math.sin(target.headingRadians) * target.speed,
    },
    attackerVelocity: {
      x: Math.cos(playerShip.headingRadians) * playerShip.speed,
      y: Math.sin(playerShip.headingRadians) * playerShip.speed,
    },
  });
}
