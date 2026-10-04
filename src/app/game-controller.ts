import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldPoint } from '../core/world-types';
import { economyResources } from '../data/economy/economy-resources';
import { tutorialCluster } from '../data/maps/tutorial-cluster';
import { tutorialPortByLocationId, tutorialPorts } from '../data/ports/tutorial-ports';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import { createPortViewModel } from '../features/port/port-view-model';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import {
  createEconomyMarketService,
  type EconomyMarketService,
} from '../systems/economy/market-service';
import {
  createLocalSpaceService,
  generateMiningSpace,
  planMiningApproachRouteAsync,
  planPointRouteAsync,
} from '../systems/local-space';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import { getAllShipDefinitions, getShipDefinition } from '../systems/ships';
import { createSystemLogService } from '../systems/system-log/system-log-service';
import { createShipTestSwitcher, type ShipTestSwitcher } from '../ui/dev/ship-test-switcher';
import { createLocalSpacePanel, type LocalSpacePanel } from '../ui/local-space/local-space-panel';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import { createPortPanel, type PortPanel } from '../ui/port/port-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';

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

function createActiveLocalModel(service: LocalSpaceService | null, ship: ShipDefinition) {
  return createLocalSpaceViewModel(requireLocalSpace(service).getSnapshot(), ship, 'Mining Zone');
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

function createMiningLocalSpace(ship: ShipDefinition, seed: number): LocalSpaceService {
  return createLocalSpaceService({
    instance: generateMiningSpace('greyrock-belt', seed),
    approachSpeed: 85,
    hardpoints: ship.sprite.hardpoints,
    nominalLengthMeters: ship.nominalLengthMeters,
  });
}

function enteredGreyrock(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && currentId === 'greyrock-belt';
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
      if (id === 'greyrock-belt' && snapshot.currentLocationId === id && !snapshot.isTravelling) {
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
  ship: ShipDefinition,
  onReturnToStarMap: () => void
): PortPanel | null {
  const locationId = navigation.getSnapshot().currentLocationId;
  const location = tutorialCluster.locations.find((entry) => entry.id === locationId);
  const port = locationId ? tutorialPortByLocationId(locationId) : null;
  const market = locationId ? markets.getMarket(locationId) : null;
  if (!location || !port || !market) return null;

  return createPortPanel({
    root,
    model: createPortViewModel(port, market, location, ship),
    onReturnToStarMap,
  });
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
  const systemLog = createSystemLogService();
  const markets = createEconomyMarketService(tutorialPorts, economyResources);
  systemLog.write('SYSTEM ONLINE');
  const starModel = () =>
    createStarMapViewModel(tutorialCluster, navigation.getSnapshot(), activeShip);
  const localModel = () => createActiveLocalModel(localSpace, activeShip);
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
  const mountPort = (): void => {
    const locationId = navigation.getSnapshot().currentLocationId;
    destroyScenePanels(panels);
    panels.port = createActivePortPanel(root, navigation, markets, activeShip, () =>
      runSceneZoomTransition(root, mountStarMap)
    );
    if (!panels.port) return;
    mode = 'port';
    systemLog.write('DOCK > ' + (locationId ?? 'UNKNOWN').toUpperCase());
    mountTestSwitcher();
  };
  const localActions = createLocalPanelActions({
    getSpace: () => localSpace,
    refresh: refreshLocalPanel,
    systemLog,
    returnToStarMap: () => {
      systemLog.write('NAV > STERNKARTE');
      runSceneZoomTransition(root, mountStarMap);
    },
  });
  const mountLocalSpace = (reuseSeed = false): void => {
    destroyScenePanels(panels);
    mode = 'local-space';
    if (!reuseSeed || localSpaceSeed === 0) {
      visitCounter += 1;
      localSpaceSeed = localSeed(visitCounter);
    }
    localSpace = createMiningLocalSpace(activeShip, localSpaceSeed);
    systemLog.write(reuseSeed ? 'TEST > SCHIFFSWECHSEL' : 'LOCAL OPS > GREYROCK BELT');
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
      if (enteredGreyrock(mode, previousLocationId, currentLocationId)) {
        runSceneZoomTransition(root, mountLocalSpace);
      }
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
