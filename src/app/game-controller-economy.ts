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
import { initializeNpcOpeningScenario } from '../systems/npcs/npc-opening-scenario';
import {
  createNpcSalvageEventService,
  type NpcSalvageEventService,
} from '../systems/npcs/npc-salvage-event-service';
import type { SectorNpcState } from '../core/npc-types';
import type { NavigationService } from '../systems/navigation';
import {
  createNpcPopulationService,
  type NpcPopulationService,
} from '../systems/npcs/npc-population-service';
import {
  createTradeCharterService,
  type TradeCharterService,
} from '../systems/economy/trade-charter-service';
import {
  createNpcSmugglingService,
  type NpcSmugglingService,
} from '../systems/economy/npc-smuggling-service';
import {
  createSmugglingService,
  type SmugglingService,
} from '../systems/economy/smuggling-service';

export interface ControllerEconomy {
  protectsPirate(factionId?: string): boolean;
  readonly markets: EconomyMarketService;
  readonly situations: MarketSituationService;
  readonly marketIntel: MarketIntelService;
  readonly trade: PlayerTradeService;
  readonly smuggling: SmugglingService;
  readonly charters: TradeCharterService;
  readonly population: NpcPopulationService;
  readonly npcSmuggling: NpcSmugglingService;
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

export function createControllerEconomy(
  navigation: NavigationService,
  onSmugglingNotice: (message: string) => void = () => {}
): ControllerEconomy {
  const situations = createMarketSituationService(sectorPorts, economyResources, 73);
  const markets = createEconomyMarketService(sectorPorts, economyResources, {
    situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
  });
  situations.advanceDay(0);
  const trade = createPlayerTradeService(markets);
  const charters = createTradeCharterService(trade.player);
  const marketIntel = createMarketIntelService(markets);
  marketIntel.recordHistory(0);
  const npcStates: SectorNpcState[] = createSectorNpcEconomyStates();
  const smuggling = createSmugglingService(trade.player, npcStates);
  const shipyardResearch = createShipyardResearchService();
  const simulation = createEconomySimulationService(
    markets,
    trade.player,
    economyResources,
    41,
    npcStates
  );
  const population = createNpcPopulationService(npcStates, markets, (id, quantity) => {
    const pool = simulation.pools[id];
    if (pool) pool.recordedLosses += quantity;
  });
  const sectorNpcs = createNpcSectorService(narrowsSector, npcStates, {
    getPlayerPosition: () => navigation.getSnapshot().currentPosition,
    markets,
    population,
  });
  const npcSmuggling = createNpcSmugglingService(npcStates, sectorNpcs, onSmugglingNotice);

  const npcEconomy = createNpcEconomyService(markets, simulation, economyResources, npcStates, {
    onSale: (npc, resourceId, quantity, gross) => {
      npcSmuggling.recordSale(npc as SectorNpcState, resourceId, quantity, gross);
      population.collectTradeCommission(Math.max(0, Math.round((gross * 0.06) / 0.94)));
    },
    positions: Object.fromEntries(
      narrowsSector.locations.map((location) => [location.id, location.position])
    ),
    travel: {
      requestTravel: (npc, destinationId, reason) =>
        sectorNpcs.requestTravel(npc as SectorNpcState, destinationId, reason),
      requestPatrol: (npc) => sectorNpcs.requestPatrol(npc as SectorNpcState),
      isTravelling: (npc) => sectorNpcs.isTravelling(npc as SectorNpcState),
      quoteTravel: (npc, destinationId, availableCredits) =>
        sectorNpcs.quoteTravel(npc as SectorNpcState, destinationId, availableCredits),
    },
  });
  npcEconomy.advanceDay(0);
  initializeNpcOpeningScenario(npcStates, sectorNpcs, npcEconomy, markets);
  const salvageEvents = createSectorSalvageEventService(narrowsSector, 0x50a7a9e);
  salvageEvents.advanceDay(0, navigation.getSnapshot().currentPosition, false);
  const npcSalvageEvents = createNpcSalvageEventService({
    world: narrowsSector,
    sector: sectorNpcs,
    events: salvageEvents,
    research: shipyardResearch,
  });

  return {
    protectsPirate(factionId) {
      if (!factionId) return false;
      return smuggling.state.protectionFaction === factionId || charters.protectsPirate(factionId);
    },
    markets,
    situations,
    marketIntel,
    trade,
    smuggling,
    charters,
    population,
    npcSmuggling,
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
