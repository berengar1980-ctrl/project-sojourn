import type { SystemLogService } from '../core/system-log-types';
import type { WorldPoint } from '../core/world-types';
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
