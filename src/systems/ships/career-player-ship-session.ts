import type { EconomyResourceDefinition, PlayerEconomyState } from '../../core/economy-types';
import { captureCareerPlayer, stageCareerPlayer } from '../economy/career-player-checkpoint';
import type { CareerPlayerCheckpoint } from '../economy/career-player-checkpoint';
import type { EconomyMarketService } from '../economy/market-service';
import type { PlayerTradeService } from '../economy/player-trade-service';
import type { ShipOperatingRecord, ShipOperatingService } from './ship-operating-costs';
import { stageCareerShipOperating } from './ship-operating-costs';
import type { ShipComponentInventoryService } from './ship-component-inventory-service';
import type { ShipLoadoutService } from './ship-loadout-service';
import type { ShipOwnershipService } from './ship-ownership-service';
import type { ShipyardResearchService } from './shipyard-research-service';
import { createShipProgressionSnapshot, stageCareerShipProgression } from './ship-progression-snapshot';
import type { ShipProgressionSnapshot, StagedCareerShipProgression } from './ship-progression-snapshot';

export interface CareerPlayerShipCheckpoint {
  readonly version: 1;
  readonly player: CareerPlayerCheckpoint;
  readonly progression: ShipProgressionSnapshot;
  readonly operating: readonly ShipOperatingRecord[];
}

export interface StagedCareerPlayerShipSession extends StagedCareerShipProgression {
  readonly trade: PlayerTradeService;
  readonly operating: ShipOperatingService;
}

/** Capture the related player and ship authorities from the same running session. */
export function captureCareerPlayerShipSession(
  player: PlayerEconomyState,
  activeShipId: string,
  ownership: ShipOwnershipService,
  loadouts: ShipLoadoutService,
  inventory: ShipComponentInventoryService,
  research: ShipyardResearchService,
  operating: ShipOperatingService
): CareerPlayerShipCheckpoint {
  return {
    version: 1,
    player: captureCareerPlayer(player),
    progression: createShipProgressionSnapshot(activeShipId, ownership, loadouts, inventory, research),
    operating: operating.snapshotAll().hulls,
  };
}

/** Stage all player and ship services against a fresh wallet, never the active wallet. */
export function stageCareerPlayerShipSession(
  checkpoint: CareerPlayerShipCheckpoint,
  starterShipId: string,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[]
): StagedCareerPlayerShipSession {
  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    !checkpoint.player ||
    !checkpoint.progression ||
    !Array.isArray(checkpoint.operating)
  ) {
    throw new Error('Invalid player and ship session checkpoint');
  }
  const trade = stageCareerPlayer(checkpoint.player, markets, resources);
  const progression = stageCareerShipProgression(
    checkpoint.progression,
    starterShipId,
    trade.player,
    trade
  );
  const operating = stageCareerShipOperating(
    checkpoint.operating,
    trade,
    progression.ownership.snapshot().ownedShipIds
  );
  return { trade, ...progression, operating };
}
