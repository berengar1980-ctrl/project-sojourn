import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { npcDefenseReaction, npcMayInitiateAttack } from '../../systems/npcs/npc-combat-ai';

/** Shared campaign NPC reaction policy chooses a world destination, never a new flight engine. */
export function fleetNpcDestination(
  npc: SectorNpcState,
  position: WorldPoint,
  waypoint: WorldPoint,
  freightExit: WorldPoint,
  danger: WorldPoint | undefined,
  threat: WorldPoint | null,
  width: number,
  height: number
): WorldPoint {
  if (danger && npcDefenseReaction(npc) === 'flee') {
    return {
      x: Math.max(180, Math.min(width - 180, position.x * 2 - danger.x)),
      y: Math.max(180, Math.min(height - 180, position.y * 2 - danger.y)),
    };
  }
  const patrolReady = npc.job === 'patrol' && npcDefenseReaction(npc) === 'fight';
  if (threat && (npc.pirate || patrolReady) && npcMayInitiateAttack(npc)) return threat;
  return npc.job === 'freighter' ? freightExit : waypoint;
}
