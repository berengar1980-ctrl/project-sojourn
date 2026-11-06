import type { NpcEconomyState } from '../../core/economy-types';
import type { NpcEconomyService } from '../economy/npc-economy-types';
import type { NpcSectorService } from './npc-sector-types';
import { beginNpcAutonomyPhase, ensureNpcAutonomy } from './npc-autonomy';
import { hashId } from './npc-sector-routing';

/**
 * The sector's existing economy is prepared in short, real simulation steps.
 * No synthetic travel, credits, or cargo are introduced.
 */
export const NPC_TRAFFIC_PREHISTORY_SECONDS = 24;
const PREHISTORY_STEP_SECONDS = 0.25;

/** Spread initial work shifts so ships need not all rest at the same moment. */
export function seedNpcStartupShifts(npcs: readonly NpcEconomyState[]): void {
  for (const npc of npcs) {
    ensureNpcAutonomy(npc);
    const shift = hashId(npc.id + ':shift') % 4;
    if (shift === 0 || (npc.role === 'miner' || npc.role === 'salvager') && shift === 1) {
      beginNpcAutonomyPhase(npc, 'ready', 0);
    } else if (shift === 1) {
      beginNpcAutonomyPhase(npc, 'thinking', 2 + (hashId(npc.id) % 4));
    } else if (npc.role === 'patrol') {
      beginNpcAutonomyPhase(npc, 'patrol-rest', 5 + shift * 3);
    } else {
      beginNpcAutonomyPhase(npc, 'resting', 4 + shift * 4);
    }
  }
}

/**
 * Advance only the requested chunk, yielding to the browser between chunks.
 * The player clock and player economy are not advanced.
 */
export function warmStartNpcTraffic(
  sector: Pick<NpcSectorService, 'tick'>,
  economy: Pick<NpcEconomyService, 'tick'>,
  seconds = NPC_TRAFFIC_PREHISTORY_SECONDS
): void {
  const steps = Math.max(0, Math.round(seconds / PREHISTORY_STEP_SECONDS));
  for (let step = 0; step < steps; step += 1) {
    sector.tick(PREHISTORY_STEP_SECONDS);
    economy.tick(PREHISTORY_STEP_SECONDS);
  }
}
