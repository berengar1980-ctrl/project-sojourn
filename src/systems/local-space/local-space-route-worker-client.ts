import type { WorldPoint } from '../../core/world-types';
import type { RoutePlanningOptions } from './local-space-navigation';

interface RouteWorkerResponse {
  readonly id: number;
  readonly route: readonly WorldPoint[];
}

let nextRequestId = 0;

export function planMiningApproachRouteAsync(
  options: RoutePlanningOptions
): Promise<readonly WorldPoint[]> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId;
    nextRequestId += 1;
    const worker = new Worker(new URL('./local-space-route-worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<RouteWorkerResponse>) => {
      if (event.data.id !== requestId) return;
      worker.terminate();
      resolve(event.data.route);
    });

    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Route worker failed.'));
    });

    worker.postMessage({ id: requestId, options });
  });
}
