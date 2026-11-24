import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShieldWorldGeometry } from './local-space-collision';
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';
import { selectedRouteOptions } from './local-space-scanning';
import type { LocalSpaceServiceOptions } from './local-space-options';

/** Merge moving, recoverable wrecks into the normal asteroid route graph. */
function navigationBodies(
  instance: LocalSpaceInstance,
  additional: readonly LocalAsteroid[]
): readonly LocalAsteroid[] {
  return additional.length ? [...instance.asteroids, ...additional] : instance.asteroids;
}

export function selectedWreckAwareRouteOptions(
  options: Pick<LocalSpaceServiceOptions, 'instance' | 'additionalObstacles'>,
  selectedId: string | null,
  shield: ShieldWorldGeometry
): RoutePlanningOptions | null {
  const instance = options.instance;
  const additional = options.additionalObstacles?.() ?? [];
  const route = selectedRouteOptions(instance, selectedId, shield);
  return route ? { ...route, asteroids: navigationBodies(instance, additional) } : null;
}

export function pointWreckAwareRouteOptions(
  options: Pick<LocalSpaceServiceOptions, 'instance' | 'additionalObstacles'>,
  target: WorldPoint,
  shield: ShieldWorldGeometry
): PointRoutePlanningOptions {
  const instance = options.instance;
  const additional = options.additionalObstacles?.() ?? [];
  return {
    start: instance.ship.position,
    target,
    asteroids: navigationBodies(instance, additional),
    clearance: Math.max(shield.radiusX, shield.radiusY) + 24,
    width: instance.width,
    height: instance.height,
  };
}
