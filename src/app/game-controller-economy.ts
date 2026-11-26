import { fieldSecurityDroneCount, isSecurityDrone } from '../core/security-drone';
import type { NpcEconomyServiceOptions } from '../systems/economy/npc-economy-types';
import { BlockadeService } from '../systems/operations/blockade-service';
import { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';
import { AsteroidClaimRegistry } from '../systems/operations/asteroid-claim-registry';
import { SectorLegalRegistry } from '../systems/operations/sector-legal-registry';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import { equipSecurityDroneMk3 } from './game-controller-security-drone-loadout';
import type { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import { PatrolCareerService } from '../systems/operations/patrol-career-service';
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

interface RestoredOperationalRegistries {
  readonly claims: AsteroidClaimRegistry;
  readonly wreckClaims: WreckClaimRegistry;
  readonly legal: SectorLegalRegistry;
}

export interface ControllerEconomy {
  readonly blockades: BlockadeService;
  readonly asteroidClaims: AsteroidClaimRegistry;
  readonly wreckClaims: WreckClaimRegistry;
  readonly legal: SectorLegalRegistry;
  readonly securityDrones: Map<string, AsteroidSecurityDrone>;
  readonly localPirates: Map<string, LocalPirateTraffic>;
  readonly npcPrisoners: Set<string>;
  readonly patrol: PatrolCareerService;
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

function npcOperationsPolicy(
  blockades: BlockadeService,
  prisoners: ReadonlySet<string>
): NpcEconomyServiceOptions {
  return {
    isManaged: (npc) =>
      prisoners.has(npc.id) ||
      npc.id.startsWith('security-drone:') ||
      (npc.role === 'miner' &&
        npc.autonomy?.phase === 'working' &&
        narrowsSector.locations.some(
          (entry) => entry.id === npc.locationId && entry.activities.mine
        )) ||
      (Boolean('pirate' in npc && npc.pirate) &&
        narrowsSector.locations.some(
          (entry) => entry.id === npc.locationId && entry.activities.mine
        ) &&
        !('travel' in npc && npc.travel)) ||
      blockades.assigned(npc.id),
    canTrade: (npc, locationId, resourceId) =>
      !blockades.blocksTrader(npc.id, locationId, resourceId),
  };
}

function createOperationsEconomy(
  markets: EconomyMarketService,
  sectorNpcs: NpcSectorService,
  trade: PlayerTradeService,
  simulation: EconomySimulationService,
  onSmugglingNotice: (message: string) => void
) {
  const npcStates = sectorNpcs.npcs;
  const patrol = new PatrolCareerService(narrowsSector, npcStates, trade.player);
  const blockades = new BlockadeService({
    sector: sectorNpcs,
    markets,
    player: trade.player,
    recordLoss: (id, amount) => {
      const pool = simulation.pools[id];
      if (pool) pool.recordedLosses += amount;
    },
    notice: onSmugglingNotice,
  });
  return { patrol, blockades };
}

export function registerSecurityDroneCombatants(npcStates: SectorNpcState[]): void {
  // Drones have normal sector NPC combatants so the existing two-ship AI
  // combat mode can be entered without creating a second combat engine.
  // The local drone service remains the authority for field sensor movement.
  const fields = narrowsSector.locations.filter(
    (location) => location.activities.mine || location.activities.salvage
  );
  const expected = fields.flatMap((field) => {
    const id = 'security-drone:' + field.id;
    return Array.from({ length: fieldSecurityDroneCount(field.dangerLevel) }, (_, index) =>
      index === 0 ? id : id + ':escort-' + (index + 1)
    );
  });
  for (let i = npcStates.length - 1; i >= 0; i--) {
    const npc = npcStates[i]!;
    if (isSecurityDrone(npc.id) && !expected.includes(npc.id)) npcStates.splice(i, 1);
  }
  const patrolTemplate = npcStates.find(
    (npc) => npc.job === 'patrol' && !npc.pirate && !isSecurityDrone(npc.id)
  );
  if (!patrolTemplate) return;
  for (const location of fields) {
    const id = 'security-drone:' + location.id;
    for (let index = 0; index < fieldSecurityDroneCount(location.dangerLevel); index++) {
      const droneId = index === 0 ? id : id + ':escort-' + (index + 1);
      const existing = npcStates.find((npc) => npc.id === droneId);
      if (existing) {
        if (existing.locationId !== location.id) {
          existing.locationId = location.id;
          delete existing.travel;
          delete existing.combatMovement;
          delete existing.orbit;
        }
        equipSecurityDroneMk3(existing);
        continue;
      }
      const drone: SectorNpcState = {
        ...patrolTemplate,
        id: droneId,
        name: 'SEC-' + location.id.toUpperCase() + (index ? '-' + (index + 1) : ''),
        locationId: location.id,
        homePortId: location.id,
        cargo: {},
        marketIntel: {},
        workResourceIds: [],
        credits: 0,
        hullHp: patrolTemplate.hullMaxHp,
        activityId: 'patrol',
        activity: 'Lokale Konzessionsüberwachung',
      };
      delete drone.travel;
      delete drone.combatMovement;
      delete drone.orbit;
      delete drone.combatRecoverySeconds;
      delete drone.combatRecoveryLocationId;
      delete drone.combatDefeats;
      delete drone.retiredUntilDay;
      equipSecurityDroneMk3(drone);
      npcStates.push(drone);
    }
  }
}

function makeNpcSalvageEvents(
  sector: ControllerEconomy['sectorNpcs'],
  events: ControllerEconomy['salvageEvents'],
  research: ControllerEconomy['shipyardResearch']
) {
  return createNpcSalvageEventService({
    world: narrowsSector,
    sector,
    events,
    research,
  });
}

function initializeSalvageEvents(navigation: NavigationService): SectorSalvageEventService {
  const events = createSectorSalvageEventService(narrowsSector, 0x50a7a9e);
  events.advanceDay(0, navigation.getSnapshot().currentPosition, false);
  return events;
}

function createSectorPopulation(
  markets: EconomyMarketService,
  trade: PlayerTradeService,
  npcStates: SectorNpcState[]
) {
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
  return { simulation, population };
}
function createControllerCustoms(
  trade: PlayerTradeService,
  sector: NpcSectorService,
  simulation: EconomySimulationService,
  notice: (message: string) => void
) {
  const recordLoss = (id: string, amount: number): void => {
    const pool = simulation.pools[id];
    if (pool) pool.recordedLosses += amount;
  };
  const npcs = sector.npcs;
  return {
    smuggling: createSmugglingService(trade.player, npcs, recordLoss),
    npcSmuggling: createNpcSmugglingService(npcs, sector, notice, Math.random, 0, recordLoss),
  };
}

export function createControllerEconomy(
  navigation: NavigationService,
  onSmugglingNotice: (message: string) => void = () => {},
  restoredRegistries?: RestoredOperationalRegistries,
  initialPopulation?: SectorNpcState[]
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
  const npcStates: SectorNpcState[] = initialPopulation ?? createSectorNpcEconomyStates();
  const shipyardResearch = createShipyardResearchService();
  const { simulation, population } = createSectorPopulation(markets, trade, npcStates);
  const sectorNpcs = createNpcSectorService(narrowsSector, npcStates, {
    getPlayerPosition: () => navigation.getSnapshot().currentPosition,
    markets,
    population,
  });
  const { patrol, blockades } = createOperationsEconomy(
    markets,
    sectorNpcs,
    trade,
    simulation,
    onSmugglingNotice
  );
  const { smuggling, npcSmuggling } = createControllerCustoms(
    trade,
    sectorNpcs,
    simulation,
    onSmugglingNotice
  );

  const npcPrisoners = new Set<string>();
  const npcEconomy = createNpcEconomyService(markets, simulation, economyResources, npcStates, {
    ...npcOperationsPolicy(blockades, npcPrisoners),
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
        blockades.blocksTrader(npc.id, destinationId)
          ? null
          : sectorNpcs.quoteTravel(npc as SectorNpcState, destinationId, availableCredits),
    },
  });
  if (!initialPopulation) {
    npcEconomy.advanceDay(0);
    initializeNpcOpeningScenario(npcStates, sectorNpcs, npcEconomy, markets);
    registerSecurityDroneCombatants(npcStates);
  }
  const salvageEvents = initializeSalvageEvents(navigation);
  const npcSalvageEvents = makeNpcSalvageEvents(sectorNpcs, salvageEvents, shipyardResearch);

  return {
    protectsPirate: (factionId) =>
      Boolean(
        factionId &&
        (smuggling.state.protectionFaction === factionId || charters.protectsPirate(factionId))
      ),
    blockades,
    asteroidClaims: restoredRegistries?.claims ?? new AsteroidClaimRegistry(),
    wreckClaims: restoredRegistries?.wreckClaims ?? new WreckClaimRegistry(),
    legal: restoredRegistries?.legal ?? new SectorLegalRegistry(),
    securityDrones: new Map<string, AsteroidSecurityDrone>(),
    localPirates: new Map<string, LocalPirateTraffic>(),
    npcPrisoners,
    patrol,
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
