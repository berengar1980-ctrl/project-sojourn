import type { NpcEconomyService } from '../economy/npc-economy-types';
import type { NpcSectorService } from './npc-sector-types';

/**
 * Generate an already-operating sector using the normal physical travel and trading
 * state machines, not random teleportation, synthetic cargo or free fuel.
 * This prehistory belongs to NPCs only; it does not advance the player's clock.
 */
export const NPC_TRAFFIC_PREHISTORY_SECONDS = 96;
const PREHISTORY_STEP_SECONDS = 0.25;

export function warmStartNpcTraffic(
  sector: Pick<NpcSectorService, 'tick'>,
  economy: Pick<NpcEconomyService, 'tick'>
): void {
  const steps = Math.round(NPC_TRAFFIC_PREHISTORY_SECONDS / PREHISTORY_STEP_SECONDS);
  for (let step = 0; step < steps; step += 1) {
    sector.tick(PREHISTORY_STEP_SECONDS);
    economy.tick(PREHISTORY_STEP_SECONDS);
  }
}
