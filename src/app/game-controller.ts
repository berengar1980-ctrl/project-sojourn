import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldLocation, WorldPoint } from '../core/world-types';
import { economyResourceById, economyResources } from '../data/economy/economy-resources';
import { createSectorNpcEconomyStates } from '../data/economy/sector-npc-economy';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPortByLocationId, sectorPorts } from '../data/ports/sector-ports';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import { createPortViewModel } from '../features/port/port-view-model';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
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
import { planMiningApproachRouteAsync, planPointRouteAsync } from '../systems/local-space';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import {
  canShipCarryResource,
  getAllShipDefinitions,
  getShipDefinition,
  resolveShipRuntimeSetup,
} from '../systems/ships';
import { createSystemLogService } from '../systems/system-log/system-log-service';
import { createShipTestSwitcher, type ShipTestSwitcher } from '../ui/dev/ship-test-switcher';
import { createLocalSpacePanel, type LocalSpacePanel } from '../ui/local-space/local-space-panel';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import { createPortPanel, type PortPanel } from '../ui/port/port-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import { createMiningLocalSpace } from './game-controller-mining';

type SceneMode = 'star-map' | 'local-space' | 'port';

interface GameControllerOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly navigation: NavigationService;
}

interface LocalPanelActions {
  readonly onSelectAsteroid: (id: string | null) => void;
  readonly onNavigate: (target: WorldPoint) => Promise<'safe' | 'risk' | false>;
  readonly onStartMining: () => Promise<void>;
  readonly onLongRangeScan: () => void;
  readonly onShortRangeScan: () => Promise<void>;
  readonly onMiningEventChoice: (
    choiceId: string
  ) => ReturnType<LocalSpaceService['resolveMiningEvent']>;
  readonly onCancelMining: () => void;
  readonly onReturnToStarMap: () => void;
}

interface LocalActionContext {
  readonly getSpace: () => LocalSpaceService | null;
  readonly refresh: () => void;
  readonly systemLog: SystemLogService;
  readonly returnToStarMap: () => void;
}

interface ControllerPanels {
  star: StarMapPanel | null;
  local: LocalSpacePanel | null;
  port: PortPanel | null;
}

interface ControllerEconomy {
  readonly markets: EconomyMarketService;
  readonly situations: MarketSituationService;
  readonly trade: PlayerTradeService;
  readonly simulation: EconomySimulationService;
  readonly mining: MiningEconomyService;
  readonly npcs: NpcEconomyService;
}

function createControllerEconomy(): ControllerEconomy {
  const situations = createMarketSituationService(sectorPorts, economyResources, 73);
  const markets = createEconomyMarketService(sectorPorts, economyResources, {
    situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
  });
  const trade = createPlayerTradeService(markets);
  const npcStates = createSectorNpcEconomyStates();
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
    npcs: createNpcEconomyService(markets, simulation, economyResources, npcStates, {
      positions: Object.fromEntries(
        narrowsSector.locations.map((location) => [location.id, location.position])
      ),
    }),
  };
}

function destroyScenePanels(panels: ControllerPanels): void {
  panels.star?.destroy();
  panels.local?.destroy();
  panels.port?.destroy();
  panels.star = null;
  panels.local = null;
  panels.port = null;
}

export interface GameController {
  tick(deltaSeconds: number): void;
}

function createControllerLog(): SystemLogService {
  const log = createSystemLogService();
  log.write('SYSTEM ONLINE');
  return log;
}

function createControllerShipSwitcher(
  root: HTMLElement,
  activeShip: ShipDefinition,
  navigation: NavigationService,
  onSwitch: (ship: ShipDefinition) => void
): ShipTestSwitcher {
  return createShipTestSwitcher({
    root,
    ships: getAllShipDefinitions(),
    activeShipId: activeShip.id,
    disabled: navigation.getSnapshot().isTravelling,
    onSelect: (shipId) => {
      const nextShip = getShipDefinition(shipId);
      if (!nextShip || nextShip.id === activeShip.id) return;
      navigation.setCruiseSpeed(nextShip.navigation.cruiseSpeed);
      onSwitch(nextShip);
    },
  });
}

function requireLocalSpace(service: LocalSpaceService | null): LocalSpaceService {
  if (!service) throw new Error('Local space is not active.');
  return service;
}

// prettier-ignore
function createActiveLocalModel(
  service: LocalSpaceService | null,
  ship: ShipDefinition,
  locationName: string
) {
  return createLocalSpaceViewModel(
    requireLocalSpace(service).getSnapshot(),
    ship,
    locationName + ' // Mining'
  );
}

function miningLocationById(locationId: string | null): WorldLocation | null {
  if (!locationId) return null;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  return location?.activities.mine ? location : null;
}

function currentMiningLocationName(navigation: NavigationService): string {
  return miningLocationById(navigation.getSnapshot().currentLocationId)?.name ?? 'Mining Zone';
}

function createStarMapReturnAction(
  root: HTMLElement,
  systemLog: SystemLogService,
  mountStarMap: () => void
): () => void {
  return () => {
    systemLog.write('NAV > STERNKARTE');
    runSceneZoomTransition(root, mountStarMap);
  };
}

function localSeed(visit: number): number {
  return (Date.now() + visit * 2654435761) >>> 0;
}

async function calculateMiningRoute(service: LocalSpaceService): Promise<readonly WorldPoint[]> {
  const options = service.getMiningRouteOptions();
  return options ? planMiningApproachRouteAsync(options) : [];
}

async function calculateScanRoute(service: LocalSpaceService): Promise<readonly WorldPoint[]> {
  const options = service.getShortRangeScanRouteOptions();
  return options ? planMiningApproachRouteAsync(options) : [];
}

async function calculatePointRoute(service: LocalSpaceService, target: WorldPoint) {
  return planPointRouteAsync(service.getPointRouteOptions(target));
}

function enteredMiningLocation(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && miningLocationById(currentId) !== null;
}

function advanceEconomyDay(
  previousId: string | null,
  currentId: string | null,
  situations: MarketSituationService,
  simulation: EconomySimulationService,
  npcs: NpcEconomyService
): void {
  if (previousId === null && currentId !== null) {
    situations.advanceNextDay();
    simulation.advanceNextDay();
    npcs.advanceNextDay();
  }
}

function createLocalPanelActions(context: LocalActionContext): LocalPanelActions {
  let navigationRequest = 0;

  return {
    onSelectAsteroid(id) {
      context.getSpace()?.selectAsteroid(id);
      context.refresh();
    },
    async onNavigate(target) {
      const activeSpace = context.getSpace();
      if (!activeSpace) return false;
      navigationRequest += 1;
      const request = navigationRequest;
      const plan = await calculatePointRoute(activeSpace, target);
      if (
        context.getSpace() !== activeSpace ||
        request !== navigationRequest ||
        plan.route.length < 2
      ) {
        return false;
      }

      activeSpace.startNavigation(plan.route[plan.route.length - 1]!, plan.route);
      context.refresh();
      return plan.compromised ? 'risk' : 'safe';
    },
    async onStartMining() {
      const activeSpace = context.getSpace();
      if (!activeSpace) return;
      const route = await calculateMiningRoute(activeSpace);
      if (context.getSpace() !== activeSpace || route.length === 0) return;
      activeSpace.startMining(route);
      context.refresh();
    },
    onLongRangeScan() {
      context.getSpace()?.startLongRangeScan();
      context.refresh();
    },
    async onShortRangeScan() {
      const activeSpace = context.getSpace();
      if (!activeSpace) return;
      const route = await calculateScanRoute(activeSpace);
      if (context.getSpace() !== activeSpace || route.length === 0) return;
      activeSpace.startShortRangeScan(route);
      context.refresh();
    },
    onMiningEventChoice(choiceId) {
      const result = context.getSpace()?.resolveMiningEvent(choiceId) ?? null;
      context.refresh();
      return result;
    },
    onCancelMining() {
      context.getSpace()?.cancelMining();
      context.refresh();
    },
    onReturnToStarMap: context.returnToStarMap,
  };
}

function createControllerStarPanel(options: {
  root: HTMLElement;
  navigation: NavigationService;
  log: SystemLogService;
  getModel: () => ReturnType<typeof createStarMapViewModel>;
  onEnterLocalSpace: () => void;
  onDock: () => void;
}): StarMapPanel {
  let panel: StarMapPanel | null = null;
  panel = createStarMapPanel({
    root: options.root,
    model: options.getModel(),
    log: options.log,
    onSelectLocation: (id) => {
      const snapshot = options.navigation.getSnapshot();
      if (miningLocationById(id) && snapshot.currentLocationId === id && !snapshot.isTravelling) {
        options.onEnterLocalSpace();
        return;
      }
      options.navigation.selectDestination(id);
      panel?.update(options.getModel());
    },
    onStartTravel: () => {
      options.navigation.startTravel();
      options.log.write('NAV > FLUG GESTARTET');
      panel?.update(options.getModel());
    },
    onDock: options.onDock,
  });
  return panel;
}

function createActivePortPanel(
  root: HTMLElement,
  navigation: NavigationService,
  markets: EconomyMarketService,
  trade: PlayerTradeService,
  ship: ShipDefinition,
  onReturnToStarMap: () => void,
  onRefresh: () => void,
  log: SystemLogService
): PortPanel | null {
  const locationId = navigation.getSnapshot().currentLocationId;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  const port = locationId ? sectorPortByLocationId(locationId) : null;
  const market = locationId ? markets.getMarket(locationId) : null;
  if (!location || !port || !market) return null;
  const runtime = resolveShipRuntimeSetup(ship);

  return createPortPanel({
    root,
    model: createPortViewModel(
      port,
      market,
      trade.player,
      location,
      ship,
      runtime.cargoCapacityTons
    ),
    onReturnToStarMap,
    onBuy: (resourceId) => {
      if (!canShipCarryResource(ship, resourceId)) {
        log.write('FRACHT > MINER NIMMT NUR ROHSTOFFE AUF');
        return;
      }
      const result = trade.buy(location.id, resourceId, 1, runtime.cargoCapacityTons);
      if (!result) return;
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(`HANDEL > +${result.quantity} ${name.toUpperCase()} · ${-result.creditsDelta} CR`);
      onRefresh();
    },
    onSell: (resourceId) => {
      const result = trade.sell(location.id, resourceId, 1);
      if (!result) return;
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(
        `HANDEL > -${result.quantity} ${name.toUpperCase()} · +${result.creditsDelta} CR · P/L ${result.realizedProfit}`
      );
      onRefresh();
    },
  });
}

function createControllerStarModel(navigation: NavigationService, ship: ShipDefinition) {
  return createStarMapViewModel(narrowsSector, navigation.getSnapshot(), ship);
}

function createControllerLocalModel(
  service: LocalSpaceService | null,
  ship: ShipDefinition,
  navigation: NavigationService
) {
  return createActiveLocalModel(service, ship, currentMiningLocationName(navigation));
}

export function createGameController(options: GameControllerOptions): GameController {
  const { root, navigation } = options;
  let activeShip = options.ship;
  let mode: SceneMode = 'star-map';
  const panels: ControllerPanels = { star: null, local: null, port: null };
  let shipSwitcher: ShipTestSwitcher | null = null;
  let localSpace: LocalSpaceService | null = null;
  let localSpaceSeed = 0;
  let visitCounter = 0;
  let previousLocationId = navigation.getSnapshot().currentLocationId;
  const systemLog = createControllerLog();
  const { markets, situations, trade, simulation, mining, npcs } = createControllerEconomy();
  const starModel = () => createControllerStarModel(navigation, activeShip);
  const localModel = () => createControllerLocalModel(localSpace, activeShip, navigation);
  const refreshLocalPanel = () => localSpace && panels.local?.update(localModel());
  const mountTestSwitcher = (): void => {
    shipSwitcher?.destroy();
    shipSwitcher = createControllerShipSwitcher(root, activeShip, navigation, (nextShip) => {
      activeShip = nextShip;
      systemLog.write('TEST > SCHIFF ' + nextShip.name.toUpperCase());
      if (mode === 'local-space') mountLocalSpace(true);
      else if (mode === 'port') mountPort();
      else mountStarMap();
    });
  };
  const mountStarMap = (): void => {
    destroyScenePanels(panels);
    localSpace = null;
    mode = 'star-map';
    panels.star = createControllerStarPanel({
      root,
      navigation,
      log: systemLog,
      getModel: starModel,
      onEnterLocalSpace: () => runSceneZoomTransition(root, mountLocalSpace),
      onDock: () => runSceneZoomTransition(root, mountPort),
    });
    mountTestSwitcher();
  };
  const mountPort = (announce = true): void => {
    const locationId = navigation.getSnapshot().currentLocationId;
    destroyScenePanels(panels);
    panels.port = createActivePortPanel(
      root,
      navigation,
      markets,
      trade,
      activeShip,
      () => runSceneZoomTransition(root, mountStarMap),
      () => mountPort(false),
      systemLog
    );
    if (!panels.port) return;
    mode = 'port';
    if (announce) systemLog.write('DOCK > ' + (locationId ?? 'UNKNOWN').toUpperCase());
    mountTestSwitcher();
  };
  const localActions = createLocalPanelActions({
    getSpace: () => localSpace,
    refresh: refreshLocalPanel,
    systemLog,
    returnToStarMap: createStarMapReturnAction(root, systemLog, mountStarMap),
  });
  const mountLocalSpace = (reuseSeed = false): void => {
    destroyScenePanels(panels);
    mode = 'local-space';
    const location = miningLocationById(navigation.getSnapshot().currentLocationId);
    if (!location) return mountStarMap();
    if (!reuseSeed || localSpaceSeed === 0) localSpaceSeed = localSeed((visitCounter += 1));
    localSpace = createMiningLocalSpace(activeShip, localSpaceSeed, mining, location);
    systemLog.write(
      reuseSeed ? 'TEST > SCHIFFSWECHSEL' : 'LOCAL OPS > ' + location.name.toUpperCase()
    );
    panels.local = createLocalSpacePanel({
      root,
      model: localModel(),
      log: systemLog,
      ...localActions,
    });
    mountTestSwitcher();
  };
  mountStarMap();
  return {
    tick(deltaSeconds) {
      const navigationSnapshot = navigation.tick(deltaSeconds);
      const currentLocationId = navigationSnapshot.currentLocationId;
      if (enteredMiningLocation(mode, previousLocationId, currentLocationId)) {
        runSceneZoomTransition(root, mountLocalSpace);
      }
      advanceEconomyDay(previousLocationId, currentLocationId, situations, simulation, npcs);
      previousLocationId = currentLocationId;
      shipSwitcher?.update(activeShip.id, navigationSnapshot.isTravelling);
      if (mode === 'star-map') panels.star?.update(starModel());
      else if (mode === 'local-space' && localSpace) {
        localSpace.tick(deltaSeconds);
        panels.local?.update(localModel());
      }
    },
  };
}
