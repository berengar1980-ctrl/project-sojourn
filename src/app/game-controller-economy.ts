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
  type ShipComponentInventoryService,
} from '../systems/ships';
import {
  createNpcSectorService,
  type NpcSectorService,
} from '../systems/npcs/npc-sector-service';
import type { SectorNpcState } from '../core/npc-types';

export interface ControllerEconomy {
  readonly markets: EconomyMarketService;
  readonly situations: MarketSituationService;
  readonly trade: PlayerTradeService;
  readonly simulation: EconomySimulationService;
  readonly mining: MiningEconomyService;
  readonly salvage: SalvageEconomyService;
  readonly components: ShipComponentInventoryService;
  readonly npcs: NpcEconomyService;
  readonly sectorNpcs: NpcSectorService;
}

export function createControllerEconomy(): ControllerEconomy {
  const situations = createMarketSituationService(sectorPorts, economyResources, 73);
  const markets = createEconomyMarketService(sectorPorts, economyResources, {
    situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
  });
  const trade = createPlayerTradeService(markets);
  const npcStates: SectorNpcState[] = createSectorNpcEconomyStates();
  const sectorNpcs = createNpcSectorService(narrowsSector, npcStates);
  const simulation = createEconomySimulationService(
    markets,
    trade.player,
    economyResources,
    41,
    npcStates
  );

  return {
    markets,
    situations,
    trade,
    simulation,
    mining: createMiningEconomyService(simulation, trade),
    salvage: createSalvageEconomyService(simulation, trade),
    components: createShipComponentInventoryService(trade.player),
    npcs: createNpcEconomyService(markets, simulation, economyResources, npcStates, {
      positions: Object.fromEntries(
        narrowsSector.locations.map((location) => [location.id, location.position])
      ),
      travel: {
        requestTravel: (npc, destinationId, reason) =>
          sectorNpcs.requestTravel(npc as SectorNpcState, destinationId, reason),
        isTravelling: (npc) => sectorNpcs.isTravelling(npc as SectorNpcState),
      },
    }),
    sectorNpcs,
  };
}
