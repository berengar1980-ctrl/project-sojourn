import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldPoint } from '../core/world-types';
import { tutorialCluster } from '../data/maps/tutorial-cluster';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import {
  createLocalSpaceService,
  generateMiningSpace,
  planMiningApproachRouteAsync,
  planPointRouteAsync,
} from '../systems/local-space';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import { createSystemLogService } from '../systems/system-log/system-log-service';
import { createLocalSpacePanel, type LocalSpacePanel } from '../ui/local-space/local-space-panel';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';

type SceneMode = 'star-map' | 'local-space';

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

export interface GameController {
  tick(deltaSeconds: number): void;
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

function createMiningLocalSpace(ship: ShipDefinition, visit: number): LocalSpaceService {
  return createLocalSpaceService({
    instance: generateMiningSpace('greyrock-belt', localSeed(visit)),
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

export function createGameController(options: GameControllerOptions): GameController {
  const { root, ship, navigation } = options;
  let mode: SceneMode = 'star-map';
  let starPanel: StarMapPanel | null = null;
  let localPanel: LocalSpacePanel | null = null;
  let localSpace: LocalSpaceService | null = null;
  let visitCounter = 0;
  let previousLocationId = navigation.getSnapshot().currentLocationId;
  const systemLog = createSystemLogService();
  systemLog.write('SYSTEM ONLINE');

  const starModel = () => createStarMapViewModel(tutorialCluster, navigation.getSnapshot(), ship);
  const localModel = () => {
    if (!localSpace) throw new Error('Local space is not active.');
    return createLocalSpaceViewModel(localSpace.getSnapshot(), ship, 'Mining Zone');
  };
  const refreshLocalPanel = () => {
    if (localSpace) localPanel?.update(localModel());
  };

  const mountStarMap = (): void => {
    localPanel?.destroy();
    localPanel = null;
    localSpace = null;
    mode = 'star-map';
    starPanel = createStarMapPanel({
      root,
      model: starModel(),
      log: systemLog,
      onSelectLocation: (id) => {
        const snapshot = navigation.getSnapshot();
        if (id === 'greyrock-belt' && snapshot.currentLocationId === id && !snapshot.isTravelling) {
          runSceneZoomTransition(root, mountLocalSpace);
          return;
        }
        navigation.selectDestination(id);
        starPanel?.update(starModel());
      },
      onStartTravel: () => {
        navigation.startTravel();
        systemLog.write('NAV > FLUG GESTARTET');
        starPanel?.update(starModel());
      },
    });
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

  const mountLocalSpace = (): void => {
    starPanel?.destroy();
    starPanel = null;
    mode = 'local-space';
    visitCounter += 1;
    localSpace = createMiningLocalSpace(ship, visitCounter);
    systemLog.write('LOCAL OPS > GREYROCK BELT');
    localPanel = createLocalSpacePanel({
      root,
      model: localModel(),
      log: systemLog,
      ...localActions,
    });
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

      if (mode === 'star-map') starPanel?.update(starModel());
      else if (localSpace) {
        localSpace.tick(deltaSeconds);
        localPanel?.update(localModel());
      }
    },
  };
}
