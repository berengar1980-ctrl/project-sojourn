import { narrowsSector } from '../data/maps/narrows-sector';
import type { CareerSnapshot } from '../systems/persistence/career-save-contract';
import {
  captureCareerFullSession,
  type StagedFullCareerSession,
} from '../systems/persistence/career-full-session';
import { captureControllerCustody } from './game-controller-law-enforcement';
import { fieldWorldFor } from './game-controller-field-world-bridge';
import { captureControllerDayElapsed } from './game-controller-events';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

/**
 * Capture the services that actually receive gameplay ticks, not a separate
 * persistence simulation. All sections are read synchronously in one frame.
 */
export function captureControllerCareer(context: ControllerRuntimeContext): CareerSnapshot {
  const { economy, state } = context;
  const custody = captureControllerCustody(context);
  const session: StagedFullCareerSession = {
    profile: state.playerProfile,
    controllerSecondsIntoDay: captureControllerDayElapsed(context),
    navigationWorld: { navigation: context.navigation, world: context.world },
    commerce: {
      commerce: {
        trade: economy.trade,
        economy: {
          markets: economy.markets,
          simulation: economy.simulation,
          situations: economy.situations,
          intel: economy.marketIntel,
          npcs: economy.npcs,
        },
        npcs: economy.sectorNpcs.npcs,
      },
      ships: {
        activeShipId: state.activeShip.id,
        trade: economy.trade,
        ownership: state.shipOwnership,
        loadouts: context.loadouts,
        inventory: economy.components,
        research: economy.shipyardResearch,
        operating: context.shipOperations,
      },
    },
    crew: context.crew,
    society: {
      charter: economy.charters,
      smuggling: economy.smuggling,
      reputation: context.reputation,
    },
    operations: {
      population: economy.population,
      sector: economy.sectorNpcs,
      blockades: economy.blockades,
      patrol: economy.patrol,
      salvageEvents: economy.salvageEvents,
    },
    fieldsLegal: {
      fields: fieldWorldFor(context),
      claims: economy.asteroidClaims,
      wreckClaims: economy.wreckClaims,
      legal: economy.legal,
    },
    custody: { prisoners: new Set(custody.prisoners), player: custody.player },
    campaigns: { campaigns: context.campaigns, events: context.campaignEvents, activate() {} },
    combat: context.engagements.activePlayerCombat(),
    activate() {},
  };
  return captureCareerFullSession(session, narrowsSector);
}
