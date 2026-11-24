import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShieldWorldGeometry } from './local-space-collision';
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';
import { selectedRouteOptions } from './local-space-scanning';

/** Merge moving, recoverable wrecks into the normal asteroid route graph. */
function navigationBodies(
  instance: LocalSpaceInstance,
  additional: readonly LocalAsteroid[]
): readonly LocalAsteroid[] {
  return additional.length ? [...instance.asteroids, ...additional] : instance.asteroids;
}

export function selectedWreckAwareRouteOptions(
  instance: LocalSpaceInstance,
  selectedId: string | null,
  shield: ShieldWorldGeometry,
  additional: readonly LocalAsteroid[]
): RoutePlanningOptions | null {
  const route = selectedRouteOptions(instance, selectedId, shield);
  return route ? { ...route, asteroids: navigationBodies(instance, additional) } : null;
}

export function pointWreckAwareRouteOptions(
  instance: LocalSpaceInstance,
  target: WorldPoint,
  shield: ShieldWorldGeometry,
  additional: readonly LocalAsteroid[]
): PointRoutePlanningOptions {
  return {
    start: instance.ship.position,
    target,
    asteroids: navigationBodies(instance, additional),
    clearance: Math.max(shield.radiusX, shield.radiusY) + 24,
    width: instance.width,
    height: instance.height,
  };
}
