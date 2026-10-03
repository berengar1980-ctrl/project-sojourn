import type { ShipDefinition } from '../core/ship-types';
import type { WorldPoint } from '../core/world-types';
import { tutorialCluster } from '../data/maps/tutorial-cluster';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import {
  createLocalSpaceService,
  generateMiningSpace,
  planMiningApproachRouteAsync,
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

export interface GameController {
  tick(deltaSeconds: number): void;
}

function localSeed(visit: number): number {
  return (Date.now() + visit * 2654435761) >>> 0;
}

async function calculateMiningRoute(service: LocalSpaceService): Promise<readonly WorldPoint[]> {
  const options = service.getMiningRouteOptions();
  if (!options) return [];
  return planMiningApproachRouteAsync(options);
}

async function calculateScanRoute(service: LocalSpaceService): Promise<readonly WorldPoint[]> {
  const options = service.getShortRangeScanRouteOptions();
  if (!options) return [];
  return planMiningApproachRouteAsync(options);
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

  const mountLocalSpace = (): void => {
    starPanel?.destroy();
    starPanel = null;
    mode = 'local-space';
    visitCounter += 1;
    localSpace = createLocalSpaceService({
      instance: generateMiningSpace('greyrock-belt', localSeed(visitCounter)),
      approachSpeed: 85,
      hardpoints: ship.sprite.hardpoints,
      nominalLengthMeters: ship.nominalLengthMeters,
    });

    systemLog.write('LOCAL OPS > GREYROCK BELT');
    localPanel = createLocalSpacePanel({
      root,
      model: localModel(),
      log: systemLog,
      onSelectAsteroid: (id) => {
        localSpace?.selectAsteroid(id);
        localPanel?.update(localModel());
      },
      onStartMining: async () => {
        const activeSpace = localSpace;
        if (!activeSpace) return;
        const route = await calculateMiningRoute(activeSpace);
        if (localSpace !== activeSpace || route.length === 0) return;
        activeSpace.startMining(route);
        localPanel?.update(localModel());
      },
      onLongRangeScan: () => {
        localSpace?.runLongRangeScan();
        systemLog.write('SCAN > LANGREICHWEITE ABGESCHLOSSEN');
        localPanel?.update(localModel());
      },
      onShortRangeScan: async () => {
        const activeSpace = localSpace;
        if (!activeSpace) return;
        const route = await calculateScanRoute(activeSpace);
        if (localSpace !== activeSpace || route.length === 0) return;
        activeSpace.startShortRangeScan(route);
        localPanel?.update(localModel());
      },
      onCancelMining: () => {
        localSpace?.cancelMining();
        localPanel?.update(localModel());
      },
      onReturnToStarMap: () => {
        systemLog.write('NAV > STERNKARTE');
        runSceneZoomTransition(root, mountStarMap);
      },
    });
  };

  mountStarMap();

  return {
    tick(deltaSeconds) {
      const navigationSnapshot = navigation.tick(deltaSeconds);
      const currentLocationId = navigationSnapshot.currentLocationId;

      if (
        mode === 'star-map' &&
        previousLocationId !== currentLocationId &&
        currentLocationId === 'greyrock-belt'
      ) {
        runSceneZoomTransition(root, mountLocalSpace);
      }

      previousLocationId = currentLocationId;

      if (mode === 'star-map') {
        starPanel?.update(starModel());
      } else if (localSpace) {
        localSpace.tick(deltaSeconds);
        localPanel?.update(localModel());
      }
    },
  };
}
