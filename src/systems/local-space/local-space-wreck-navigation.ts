import type { LocalSpaceInstance } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShieldWorldGeometry } from './local-space-collision';
import type {
  PointRoutePlanningOptions,
  RoutePlanningOptions,
  RouteObstacle,
} from './local-space-navigation';
import { selectedRouteOptions } from './local-space-scanning';
import type { LocalSpaceServiceOptions } from './local-space-options';
import { trafficRouteBodies } from '../navigation/field-traffic-obstacles';

/** Merge moving, recoverable wrecks into the normal asteroid route graph. */
function navigationBodies(
  instance: LocalSpaceInstance,
  additional: readonly RouteObstacle[]
): readonly RouteObstacle[] {
  return additional.length ? [...instance.asteroids, ...additional] : instance.asteroids;
}

export function selectedWreckAwareRouteOptions(
  options: Pick<
    LocalSpaceServiceOptions,
    'instance' | 'additionalObstacles' | 'getTrafficObstacles'
  >,
  selectedId: string | null,
  shield: ShieldWorldGeometry
): RoutePlanningOptions | null {
  const instance = options.instance;
  const additional = [
    ...(options.additionalObstacles?.() ?? []),
    ...trafficRouteBodies(options.getTrafficObstacles?.() ?? []),
  ];
  const route = selectedRouteOptions(instance, selectedId, shield);
  return route ? { ...route, asteroids: navigationBodies(instance, additional) } : null;
}

export function pointWreckAwareRouteOptions(
  options: Pick<
    LocalSpaceServiceOptions,
    'instance' | 'additionalObstacles' | 'getTrafficObstacles'
  >,
  target: WorldPoint,
  shield: ShieldWorldGeometry
): PointRoutePlanningOptions {
  const instance = options.instance;
  const additional = [
    ...(options.additionalObstacles?.() ?? []),
    ...trafficRouteBodies(options.getTrafficObstacles?.() ?? []),
  ];
  return {
    start: instance.ship.position,
    target,
    asteroids: navigationBodies(instance, additional),
    clearance: Math.max(shield.radiusX, shield.radiusY) + 24,
    width: instance.width,
    height: instance.height,
  };
}
