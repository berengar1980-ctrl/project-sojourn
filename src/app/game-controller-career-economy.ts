import { narrowsSector } from '../data/maps/narrows-sector';
import { createMiningEconomyService } from '../systems/economy/mining-economy-service';
import { createSalvageEconomyService } from '../systems/economy/salvage-economy-service';
import { createNpcSmugglingService } from '../systems/economy/npc-smuggling-service';
import { createNpcSalvageEventService } from '../systems/npcs/npc-salvage-event-service';
import type { StagedFullCareerSession } from '../systems/persistence/career-full-session';
import type { ControllerEconomy } from './game-controller-economy';

/**
 * Bind the live controller to one detached Career session. Never recreate
 * markets, the player wallet, NPCs, or day-zero economy transactions here.
 */
export function controllerEconomyFromCareer(
  session: StagedFullCareerSession,
  notice: (message: string) => void
): ControllerEconomy {
  const { commerce } = session.commerce;
  const { economy, trade } = commerce;
  const { operations, fieldsLegal, society } = session;
  const { population, sector, blockades, patrol, salvageEvents } = operations;
  const research = session.commerce.ships.research;
  const npcSmuggling = createNpcSmugglingService(
    sector.npcs,
    sector,
    notice,
    Math.random,
    economy.situations.currentDay
  );
  const npcSalvageEvents = createNpcSalvageEventService({
    world: narrowsSector,
    sector,
    events: salvageEvents,
    research,
  });
  return {
    protectsPirate: (id) =>
      Boolean(
        id &&
        (society.smuggling.state.protectionFaction === id || society.charter.protectsPirate(id))
      ),
    blockades,
    asteroidClaims: fieldsLegal.claims,
    wreckClaims: fieldsLegal.wreckClaims,
    legal: fieldsLegal.legal,
    securityDrones: new Map(),
    localPirates: new Map(),
    npcPrisoners: new Set(session.custody.prisoners),
    patrol,
    markets: economy.markets,
    situations: economy.situations,
    marketIntel: economy.intel,
    trade,
    smuggling: society.smuggling,
    charters: society.charter,
    population,
    npcSmuggling,
    simulation: economy.simulation,
    mining: createMiningEconomyService(economy.simulation, trade),
    salvage: createSalvageEconomyService(economy.simulation, trade),
    components: session.commerce.ships.inventory,
    shipyardResearch: research,
    salvageEvents,
    npcSalvageEvents,
    npcs: economy.npcs,
    sectorNpcs: sector,
  };
}
