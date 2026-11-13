import type { SystemLogService } from '../core/system-log-types';
import { controllerLocalModel, createStarMapReturnAction } from './game-controller-models';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { WorldPoint } from '../core/world-types';
import { playerAtLocalExit } from '../ui/map/local-space-exit-gate';
import {
  planMiningApproachRouteAsync,
  planPointRouteAsync,
  type LocalSpaceService,
} from '../systems/local-space';

export interface LocalPanelActions {
  readonly onSelectAsteroid: (id: string | null) => void;
  readonly onNavigate: (target: WorldPoint) => Promise<'safe' | 'risk' | false>;
  readonly onStartMining: () => Promise<void>;
  readonly onMiningResourceSelection: (resourceIds: readonly string[] | null) => void;
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
  readonly confirmMining?: () => boolean;
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

export function createLocalPanelActions(context: LocalActionContext): LocalPanelActions {
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
    onMiningResourceSelection(resourceIds) {
      context.getSpace()?.setMiningResourceSelection(resourceIds);
      context.refresh();
    },
    async onStartMining() {
      const activeSpace = context.getSpace();
      if (!activeSpace || (context.confirmMining && !context.confirmMining())) return;
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
    onReturnToStarMap() {
      const snapshot = context.getSpace()?.getSnapshot();
      if (!snapshot) return;
      const { width, height, ship } = snapshot.instance;
      if (!playerAtLocalExit(ship.position, width, height, snapshot.instance.seed)) {
        context.systemLog.write('NAV > BITTE ZUERST DEN MARKIERTEN AUSGANG ANFLIEGEN');
        return;
      }
      context.returnToStarMap();
    },
  };
}

export function createControllerLocalActions(
  context: ControllerRuntimeContext,
  mountStarMap: () => void
): LocalPanelActions {
  return createLocalPanelActions({
    getSpace: () => context.state.localSpace,
    refresh: () => {
      if (context.state.localSpace) {
        context.state.panels.local?.update(controllerLocalModel(context));
      }
    },
    systemLog: context.systemLog,
    confirmMining: () => {
      const space = context.state.localSpace?.getSnapshot();
      if (!space?.selectedAsteroidId) return true;
      const asteroid = space.instance.asteroids.find((entry) => entry.id === space.selectedAsteroidId);
      if (!asteroid) return true;
      const claim = context.economy.asteroidClaims.claim(space.instance.sourceLocationId, asteroid);
      if (!claim || claim.ownerId === 'player') return true;
      return window.confirm(
        'FREMDKONZESSION – UNBEFUGTER ABBAU!\n' +
        'Asteroid: ' + asteroid.id + '\n' +
        'Eigentümer: ' + claim.ownerId + '\n\n' +
        'Raubbau kann Geldstrafen und eine Fahndung auslösen. Trotzdem abbauen?'
      );
    },
    returnToStarMap: createStarMapReturnAction(context.root, context.systemLog, mountStarMap),
  });
}
