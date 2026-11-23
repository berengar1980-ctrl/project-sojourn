import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { npcMayTargetNpc } from '../../systems/npcs/npc-combat-ai';

/** Patrols can react to any detected pirate without inventing a new battle engine. */
export function fleetPatrolContact(
  patrol: SectorNpcState,
  origin: WorldPoint,
  candidates: readonly SectorNpcState[],
  position: (id: string) => WorldPoint | null
): WorldPoint | null {
  if (patrol.job !== 'patrol') return null;
  for (const candidate of candidates) {
    if (!npcMayTargetNpc(patrol, candidate)) continue;
    const target = position(candidate.id);
    if (target && Math.hypot(target.x - origin.x, target.y - origin.y) < 650) return target;
  }
  return null;
}
