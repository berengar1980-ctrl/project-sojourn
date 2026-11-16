import type { EconomyResourceDefinition } from '../../core/economy-types';
import type { PortDefinition } from '../../core/port-types';
import type { WorldMap } from '../../core/world-types';
import type { CareerEconomyOptions } from '../economy/career-economy-session';
import {
  stageCareerPlayerShipSession,
  type CareerPlayerShipCheckpoint,
  type StagedCareerPlayerShipSession,
} from '../ships/career-player-ship-session';
import {
  stageCareerCommerceSession,
  type CareerCommerceCheckpoint,
  type StagedCareerCommerceSession,
} from './career-commerce-session';

export interface CareerCommerceShipCheckpoint {
  readonly version: 1;
  readonly commerce: CareerCommerceCheckpoint;
  readonly ships: CareerPlayerShipCheckpoint;
}

export interface StagedCareerCommerceShipSession {
  readonly commerce: StagedCareerCommerceSession;
  readonly ships: StagedCareerPlayerShipSession;
}

/**
 * All ship services are constructed with the exact same detached wallet and
 * market services that the NPC economy uses. None of the active services are touched.
 */
export function stageCareerCommerceShipSession(
  checkpoint: CareerCommerceShipCheckpoint,
  world: WorldMap,
  ports: readonly PortDefinition[],
  resources: readonly EconomyResourceDefinition[],
  seed: number,
  starterShipId: string,
  options: CareerEconomyOptions = {}
): StagedCareerCommerceShipSession {
  if (!checkpoint || checkpoint.version !== 1 || !checkpoint.commerce || !checkpoint.ships) {
    throw new Error('Invalid combined commerce and ship checkpoint');
  }
  const commerce = stageCareerCommerceSession(
    checkpoint.commerce,
    world,
    ports,
    resources,
    seed,
    options
  );
  const ships = stageCareerPlayerShipSession(
    checkpoint.ships,
    starterShipId,
    commerce.economy.markets,
    resources,
    commerce.trade
  );
  return { commerce, ships };
}
