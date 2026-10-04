import type { WorldPoint } from '../../core/world-types';
import type {
  PointRoutePlan,
  PointRoutePlanningOptions,
  RoutePlanningOptions,
} from './local-space-navigation';

interface RouteWorkerResponse {
  readonly id: number;
  readonly route: readonly WorldPoint[];
  readonly compromised: boolean;
}

let nextRequestId = 0;

function requestRoute(
  kind: 'mining' | 'point',
  options: RoutePlanningOptions | PointRoutePlanningOptions
): Promise<RouteWorkerResponse> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId;
    nextRequestId += 1;
    const worker = new Worker(new URL('./local-space-route-worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<RouteWorkerResponse>) => {
      if (event.data.id !== requestId) return;
      worker.terminate();
      resolve(event.data);
    });

    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Route worker failed.'));
    });

    worker.postMessage({ id: requestId, kind, options });
  });
}

export function planMiningApproachRouteAsync(
  options: RoutePlanningOptions
): Promise<readonly WorldPoint[]> {
  return requestRoute('mining', options).then((response) => response.route);
}

export function planPointRouteAsync(options: PointRoutePlanningOptions): Promise<PointRoutePlan> {
  return requestRoute('point', options).then((response) => ({
    route: response.route,
    compromised: response.compromised,
  }));
}
