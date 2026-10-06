import type { LocalSpaceInstance } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShieldWorldGeometry } from './local-space-collision';
import type { PointRoutePlanningOptions } from './local-space-navigation';

export function createPointRouteOptions(
  instance: LocalSpaceInstance,
  target: WorldPoint,
  shield: ShieldWorldGeometry
): PointRoutePlanningOptions {
  return {
    start: instance.ship.position,
    target,
    asteroids: instance.asteroids,
    clearance: Math.max(shield.radiusX, shield.radiusY) + 24,
    width: instance.width,
    height: instance.height,
  };
}
