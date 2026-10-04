import type { WorldPoint } from '../../core/world-types';
import {
  planMiningApproachRoute,
  planPointRoute,
  type PointRoutePlanningOptions,
  type RoutePlanningOptions,
} from './local-space-navigation';

type RouteWorkerRequest =
  | {
      readonly id: number;
      readonly kind: 'mining';
      readonly options: RoutePlanningOptions;
    }
  | {
      readonly id: number;
      readonly kind: 'point';
      readonly options: PointRoutePlanningOptions;
    };

interface RouteWorkerResponse {
  readonly id: number;
  readonly route: readonly WorldPoint[];
}

self.addEventListener('message', (event: MessageEvent<RouteWorkerRequest>) => {
  const route =
    event.data.kind === 'point'
      ? planPointRoute(event.data.options)
      : planMiningApproachRoute(event.data.options);
  const response: RouteWorkerResponse = { id: event.data.id, route };
  self.postMessage(response);
});
