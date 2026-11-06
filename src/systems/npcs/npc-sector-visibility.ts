import type { SectorNpcState } from '../../core/npc-types';

/**
 * An occupied docking berth is not a ship loitering in open space.
 * The NPC remains in the economy and can depart normally when its task starts.
 */
export function npcVisibleInSpace(
  npc: Pick<
    SectorNpcState,
    'travel' | 'combatMovement' | 'autonomy' | 'job' | 'locationId' | 'workLocationId'
  >
): boolean {
  if (npc.travel || npc.combatMovement) return true;
  return (
    (npc.job === 'miner' || npc.job === 'salvager') &&
    npc.autonomy?.phase === 'working' &&
    npc.locationId === npc.workLocationId
  );
}
