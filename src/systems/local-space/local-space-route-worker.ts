import type { WorldPoint } from '../../core/world-types';
import { planMiningApproachRoute, type RoutePlanningOptions } from './local-space-navigation';

interface RouteWorkerRequest {
  readonly id: number;
  readonly options: RoutePlanningOptions;
}

interface RouteWorkerResponse {
  readonly id: number;
  readonly route: readonly WorldPoint[];
}

self.addEventListener('message', (event: MessageEvent<RouteWorkerRequest>) => {
  const response: RouteWorkerResponse = {
    id: event.data.id,
    route: planMiningApproachRoute(event.data.options),
  };
  self.postMessage(response);
});
