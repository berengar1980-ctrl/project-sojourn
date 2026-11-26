import type { NpcEconomyState } from '../../core/economy-types';
import type { NpcEconomyCheckpoint } from './npc-economy-types';

export function validateNpcEconomyCheckpoint(
  checkpoint: NpcEconomyCheckpoint,
  npcs: readonly NpcEconomyState[]
): void {
  if (
    checkpoint.version !== 1 ||
    !Number.isSafeInteger(checkpoint.lastDay) ||
    checkpoint.lastDay < -1 ||
    !Array.isArray(checkpoint.npcIds) ||
    checkpoint.npcIds.length !== npcs.length
  ) {
    throw new Error('Invalid NPC economy checkpoint');
  }
  const known = new Set(npcs.map((npc) => npc.id));
  if (
    known.size !== npcs.length ||
    new Set(checkpoint.npcIds).size !== checkpoint.npcIds.length ||
    checkpoint.npcIds.some((id) => !known.has(id))
  ) {
    throw new Error('NPC economy checkpoint identity mismatch');
  }
}
