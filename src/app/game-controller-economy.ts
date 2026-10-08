import { economyResources } from '../data/economy/economy-resources';
import { createSectorNpcEconomyStates } from '../data/economy/sector-npc-economy';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPorts } from '../data/ports/sector-ports';
import {
  createEconomyMarketService,
  type EconomyMarketService,
} from '../systems/economy/market-service';
import {
  createMarketSituationService,
  type MarketSituationService,
} from '../systems/economy/market-situation-service';
import {
  createMarketIntelService,
  type MarketIntelService,
} from '../systems/economy/market-intel-service';
import {
  createEconomySimulationService,
  type EconomySimulationService,
} from '../systems/economy/economy-simulation-service';
import {
  createMiningEconomyService,
  type MiningEconomyService,
} from '../systems/economy/mining-economy-service';
import {
  createNpcEconomyService,
  type NpcEconomyService,
} from '../systems/economy/npc-economy-service';
import {
  createPlayerTradeService,
  type PlayerTradeService,
} from '../systems/economy/player-trade-service';
import {
  createSalvageEconomyService,
  type SalvageEconomyService,
} from '../systems/economy/salvage-economy-service';
import {
  createShipComponentInventoryService,
  createShipyardResearchService,
  type ShipComponentInventoryService,
  type ShipyardResearchService,
} from '../systems/ships';
import {
  createSectorSalvageEventService,
  type SectorSalvageEventService,
} from '../systems/salvage';
import { createNpcSectorService, type NpcSectorService } from '../systems/npcs/npc-sector-service';
import {
  createNpcSalvageEventService,
  type NpcSalvageEventService,
} from '../systems/npcs/npc-salvage-event-service';
import type { SectorNpcState } from '../core/npc-types';
import type { NavigationService } from '../systems/navigation';

export interface ControllerEconomy {
  readonly markets: EconomyMarketService;
  readonly situations: MarketSituationService;
  readonly marketIntel: MarketIntelService;
  readonly trade: PlayerTradeService;
  readonly simulation: EconomySimulationService;
  readonly mining: MiningEconomyService;
  readonly salvage: SalvageEconomyService;
  readonly components: ShipComponentInventoryService;
  readonly shipyardResearch: ShipyardResearchService;
  readonly salvageEvents: SectorSalvageEventService;
  readonly npcSalvageEvents: NpcSalvageEventService;
  readonly npcs: NpcEconomyService;
  readonly sectorNpcs: NpcSectorService;
}

export function createControllerEconomy(navigation: NavigationService): ControllerEconomy {
  const situations = createMarketSituationService(sectorPorts, economyResources, 73);
  const markets = createEconomyMarketService(sectorPorts, economyResources, {
    situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
  });
  situations.advanceDay(0);
  const trade = createPlayerTradeService(markets);
  const marketIntel = createMarketIntelService(markets);
  marketIntel.recordHistory(0);
  const npcStates: SectorNpcState[] = createSectorNpcEconomyStates();
  const shipyardResearch = createShipyardResearchService();
  const sectorNpcs = createNpcSectorService(narrowsSector, npcStates, {
    getPlayerPosition: () => navigation.getSnapshot().currentPosition,
  });
  const simulation = createEconomySimulationService(
    markets,
    trade.player,
    economyResources,
    41,
    npcStates
  );

  const npcEconomy = createNpcEconomyService(markets, simulation, economyResources, npcStates, {
    positions: Object.fromEntries(
      narrowsSector.locations.map((location) => [location.id, location.position])
    ),
    travel: {
      requestTravel: (npc, destinationId, reason) =>
        sectorNpcs.requestTravel(npc as SectorNpcState, destinationId, reason),
      requestPatrol: (npc) => sectorNpcs.requestPatrol(npc as SectorNpcState),
      isTravelling: (npc) => sectorNpcs.isTravelling(npc as SectorNpcState),
    },
  });
  npcEconomy.advanceDay(0);
  const salvageEvents = createSectorSalvageEventService(narrowsSector, 0x50a7a9e);
  const npcSalvageEvents = createNpcSalvageEventService({
    world: narrowsSector,
    sector: sectorNpcs,
    events: salvageEvents,
    research: shipyardResearch,
  });

  return {
    markets,
    situations,
    marketIntel,
    trade,
    simulation,
    mining: createMiningEconomyService(simulation, trade),
    salvage: createSalvageEconomyService(simulation, trade),
    components: createShipComponentInventoryService(trade.player),
    shipyardResearch,
    salvageEvents,
    npcSalvageEvents,
    npcs: npcEconomy,
    sectorNpcs,
  };
}
