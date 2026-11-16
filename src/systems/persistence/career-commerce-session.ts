import type { EconomyResourceDefinition, PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { PortDefinition } from '../../core/port-types';
import type { WorldMap } from '../../core/world-types';
import {
  captureCareerPlayer,
  stageCareerPlayer,
  type CareerPlayerCheckpoint,
} from '../economy/career-player-checkpoint';
import type { PlayerTradeService } from '../economy/player-trade-service';
import type { NpcEconomyServiceOptions } from '../economy/npc-economy-types';
import {
  captureCareerNpcEconomySession,
  stageCareerNpcEconomySession,
  type CareerNpcEconomySessionCheckpoint,
  type StagedCareerNpcEconomySession,
} from './career-npc-economy-session';

export interface CareerCommerceCheckpoint {
  readonly version: 1;
  readonly player: CareerPlayerCheckpoint;
  readonly sector: CareerNpcEconomySessionCheckpoint;
}

export interface StagedCareerCommerceSession extends StagedCareerNpcEconomySession {
  readonly trade: PlayerTradeService;
}

/** Capture player cargo, NPC plans and market accounts in the same tick. */
export function captureCareerCommerceSession(
  player: PlayerEconomyState,
  world: WorldMap,
  npcs: readonly SectorNpcState[],
  sector: StagedCareerNpcEconomySession['economy']
): CareerCommerceCheckpoint {
  return {
    version: 1,
    player: captureCareerPlayer(player),
    sector: captureCareerNpcEconomySession(world, npcs, sector),
  };
}

/** Restore the player trade wallet against the same new market service as the NPC economy. */
export function stageCareerCommerceSession(
  checkpoint: CareerCommerceCheckpoint,
  world: WorldMap,
  ports: readonly PortDefinition[],
  resources: readonly EconomyResourceDefinition[],
  seed: number,
  options: NpcEconomyServiceOptions = {}
): StagedCareerCommerceSession {
  if (!checkpoint || checkpoint.version !== 1 || !checkpoint.player || !checkpoint.sector) {
    throw new Error('Invalid combined career commerce checkpoint');
  }
  let trade: PlayerTradeService | null = null;
  const sector = stageCareerNpcEconomySession(
    checkpoint.sector,
    world,
    ports,
    resources,
    (markets) => {
      trade = stageCareerPlayer(checkpoint.player, markets, resources);
      return trade.player;
    },
    seed,
    options
  );
  if (!trade) throw new Error('Career commerce player was not staged');
  return { ...sector, trade };
}
