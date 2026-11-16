import type { PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import type { EconomyMarketService } from '../economy/market-service';
import type { EconomySimulationService } from '../economy/economy-simulation-service';
import {
  createNpcPopulationService,
  type NpcPopulationService,
} from '../npcs/npc-population-service';
import type { NpcPopulationCheckpoint } from '../npcs/npc-population-checkpoint';
import { createNpcSectorService, type NpcSectorService } from '../npcs/npc-sector-service';
import { BlockadeService } from '../operations/blockade-service';
import { PatrolCareerService } from '../operations/patrol-career-service';
import type {
  CareerBlockadeCheckpoint,
  CareerPatrolCheckpoint,
} from '../operations/career-operations-checkpoint';

export interface CareerOperationsCheckpoint {
  readonly version: 1;
  readonly population: NpcPopulationCheckpoint;
  readonly blockades: CareerBlockadeCheckpoint;
  readonly patrol: CareerPatrolCheckpoint;
}

export interface StagedCareerOperationsSession {
  readonly population: NpcPopulationService;
  readonly sector: NpcSectorService;
  readonly blockades: BlockadeService;
  readonly patrol: PatrolCareerService;
}

function recordLoss(simulation: EconomySimulationService, id: string, amount: number): void {
  const pool = simulation.pools[id];
  if (pool) pool.recordedLosses += amount;
}

/**
 * Reuse the same detached NPC identities and resource pools. Historical
 * contracts and completed rewards are installed without replaying payments.
 */
export function stageCareerOperationsSession(
  checkpoint: CareerOperationsCheckpoint,
  world: WorldMap,
  npcs: readonly SectorNpcState[],
  markets: EconomyMarketService,
  simulation: EconomySimulationService,
  player: PlayerEconomyState,
  getPlayerPosition?: () => WorldPoint
): StagedCareerOperationsSession {
  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    !checkpoint.population ||
    !checkpoint.blockades ||
    !checkpoint.patrol
  ) {
    throw new Error('Invalid career operations session checkpoint');
  }
  const population = createNpcPopulationService(
    npcs,
    markets,
    (id, count) => recordLoss(simulation, id, count),
    checkpoint.population
  );
  const sector = createNpcSectorService(world, npcs, {
    ...(getPlayerPosition ? { getPlayerPosition } : {}),
    markets,
    population,
  });
  const blockades = new BlockadeService(
    {
      sector,
      markets,
      player,
      recordLoss: (id, count) => recordLoss(simulation, id, count),
      notice: () => {},
    },
    checkpoint.blockades
  );
  const patrol = new PatrolCareerService(world, npcs, player, checkpoint.patrol);
  return { population, sector, blockades, patrol };
}

export function captureCareerOperationsSession(
  session: StagedCareerOperationsSession
): CareerOperationsCheckpoint {
  return {
    version: 1,
    population: session.population.exportState(),
    blockades: session.blockades.exportState(),
    patrol: session.patrol.exportState(),
  };
}
