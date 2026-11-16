import type { EconomyResourceDefinition, PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { PortDefinition } from '../../core/port-types';
import type { WorldMap } from '../../core/world-types';
import {
  captureCareerEconomySession,
  stageCareerEconomySession,
  type CareerEconomySessionCheckpoint,
  type StagedCareerEconomySession,
} from '../economy/career-economy-session';
import type { NpcEconomyServiceOptions } from '../economy/npc-economy-types';
import {
  captureCareerNpcs,
  stageCareerNpcs,
  type CareerNpcCheckpoint,
} from './career-npc-checkpoint';

export interface CareerNpcEconomySessionCheckpoint {
  readonly version: 1;
  readonly npcs: CareerNpcCheckpoint;
  readonly economy: CareerEconomySessionCheckpoint;
}

export interface StagedCareerNpcEconomySession {
  readonly npcs: readonly SectorNpcState[];
  readonly economy: StagedCareerEconomySession;
}

/** Capture the sector's ships and accounting authorities at one simulation boundary. */
export function captureCareerNpcEconomySession(
  world: WorldMap,
  npcs: readonly SectorNpcState[],
  economy: StagedCareerEconomySession
): CareerNpcEconomySessionCheckpoint {
  if (economy.npcs.npcs.length !== npcs.length) {
    throw new Error('Career NPC economy count mismatch');
  }
  for (let index = 0; index < npcs.length; index += 1) {
    if (economy.npcs.npcs[index] !== npcs[index]) {
      throw new Error('Career NPC economy identity mismatch');
    }
  }
  return {
    version: 1,
    npcs: captureCareerNpcs(world, npcs),
    economy: captureCareerEconomySession(economy),
  };
}

/**
 * Stage sector NPCs before markets, physical pools and trading services.
 * No live NPC or economy service is modified if any section is invalid.
 */
export function stageCareerNpcEconomySession(
  checkpoint: CareerNpcEconomySessionCheckpoint,
  world: WorldMap,
  ports: readonly PortDefinition[],
  resources: readonly EconomyResourceDefinition[],
  player: PlayerEconomyState,
  seed: number,
  options: NpcEconomyServiceOptions = {}
): StagedCareerNpcEconomySession {
  if (!checkpoint || checkpoint.version !== 1 || !checkpoint.npcs || !checkpoint.economy) {
    throw new Error('Invalid combined NPC economy checkpoint');
  }
  const npcs = stageCareerNpcs(world, checkpoint.npcs);
  const economy = stageCareerEconomySession(
    checkpoint.economy,
    ports,
    resources,
    player,
    npcs,
    seed,
    options
  );
  return { npcs, economy };
}
