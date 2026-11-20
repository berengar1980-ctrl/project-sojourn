import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { npcCombatant } from './npc-combatant-setup';
import type { FleetCombatParticipant } from './fleet-combat-service';

/**
 * Career NPC -> shared FleetCombat participant. Uses the exact same NPC combat
 * equipment, doctrine, skill and hull resolver used by the career 1vs1 path.
 * No PvP DuelDraft or random test loadout is involved.
 *
 * This is a *setup* adapter, not an independent NPC AI or a complete career
 * checkpoint handoff. The live world owns travel, cargo and work state.
 */
export function createFleetCareerNpcParticipant(
  npc: SectorNpcState,
  position: WorldPoint,
  options: {
    readonly headingRadians?: number;
    readonly targetId?: string | null;
    readonly spawnAtSeconds?: number;
  } = {}
): FleetCombatParticipant {
  const setup = npcCombatant(npc);
  if (!setup) throw new Error('Unknown career NPC ship: ' + npc.shipId);
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
    throw new Error('Invalid career NPC local position: ' + npc.id);

  const factionId =
    npc.pirate || npc.job === 'pirate'
      ? npc.factionId === 'pirates2'
        ? 'pirate-b'
        : 'pirate-a'
      : npc.id.startsWith('security-drone:')
        ? 'security'
        : 'civilian';

  return {
    setup,
    factionId,
    position: { ...position },
    ...(options.headingRadians !== undefined ? { headingRadians: options.headingRadians } : {}),
    ...(options.targetId !== undefined ? { targetId: options.targetId } : {}),
    ...(options.spawnAtSeconds !== undefined ? { spawnAtSeconds: options.spawnAtSeconds } : {}),
  };
}
