import type {
  EconomyResourceDefinition,
  NpcEconomyState,
  PlayerEconomyState,
} from '../../core/economy-types';
import type { PortDefinition } from '../../core/port-types';
import {
  captureCareerMarkets,
  stageCareerMarkets,
  type CareerMarketCheckpoint,
} from './career-market-checkpoint';
import type { CareerResourcePoolCheckpoint } from './career-resource-pool-checkpoint';
import {
  createEconomySimulationService,
  type EconomySimulationService,
} from './economy-simulation-service';
import {
  createMarketIntelService,
  type CareerMarketIntelCheckpoint,
  type MarketIntelService,
} from './market-intel-service';
import {
  createMarketSituationService,
  type MarketSituationCheckpoint,
  type MarketSituationService,
} from './market-situation-service';
import type { EconomyMarketService } from './market-service';
import { createNpcEconomyService } from './npc-economy-service';
import type {
  NpcEconomyCheckpoint,
  NpcEconomyService,
  NpcEconomyServiceOptions,
} from './npc-economy-types';

export interface CareerEconomySessionCheckpoint {
  readonly version: 1;
  readonly markets: CareerMarketCheckpoint;
  readonly pools: CareerResourcePoolCheckpoint;
  readonly situations: MarketSituationCheckpoint;
  readonly intel: CareerMarketIntelCheckpoint;
  readonly npcEconomy: NpcEconomyCheckpoint;
}

export interface StagedCareerEconomySession {
  readonly markets: EconomyMarketService;
  readonly simulation: EconomySimulationService;
  readonly situations: MarketSituationService;
  readonly intel: MarketIntelService;
  readonly npcs: NpcEconomyService;
}

/** Capture mutually dependent economic authorities at the same simulation boundary. */
export function captureCareerEconomySession(
  session: StagedCareerEconomySession
): CareerEconomySessionCheckpoint {
  return {
    version: 1,
    markets: captureCareerMarkets(session.markets),
    pools: session.simulation.exportState(),
    situations: session.situations.exportState(),
    intel: session.intel.exportState(),
    npcEconomy: session.npcs.exportState(),
  };
}

/**
 * Build new economic services before installation into a career.
 * The supplied player and NPCs must already have been staged from the same save.
 */
export function stageCareerEconomySession(
  checkpoint: CareerEconomySessionCheckpoint,
  ports: readonly PortDefinition[],
  resources: readonly EconomyResourceDefinition[],
  player: PlayerEconomyState,
  npcs: readonly NpcEconomyState[],
  seed: number,
  options: NpcEconomyServiceOptions = {}
): StagedCareerEconomySession {
  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    !checkpoint.markets ||
    !checkpoint.pools ||
    !checkpoint.situations ||
    !checkpoint.intel ||
    !checkpoint.npcEconomy
  ) {
    throw new Error('Incomplete career economy session checkpoint');
  }
  const situations = createMarketSituationService(
    ports,
    resources,
    seed,
    checkpoint.situations
  );
  const markets = stageCareerMarkets(checkpoint.markets, ports, resources, {
    situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
  });
  const simulation = createEconomySimulationService(
    markets,
    player,
    resources,
    seed,
    npcs,
    checkpoint.pools
  );
  const intel = createMarketIntelService(markets, checkpoint.intel);
  const npcService = createNpcEconomyService(
    markets,
    simulation,
    resources,
    npcs,
    options,
    checkpoint.npcEconomy
  );
  return { markets, simulation, situations, intel, npcs: npcService };
}
