import type { LocalAsteroid } from '../../core/local-space-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { shipShieldGeometry } from '../../core/ship-contact-geometry';
import type { FieldRouteObstacle } from './field-ship-routing';

/** Navigation only. The real ship remains owned by its normal physics service. */
export function shipTrafficObstacle(
  id: string,
  ship: ShipDefinition,
  pose: { readonly position: WorldPoint; readonly headingRadians: number }
): FieldRouteObstacle {
  const geometry = shipShieldGeometry(ship);
  const cosine = Math.cos(pose.headingRadians);
  const sine = Math.sin(pose.headingRadians);
  return {
    id,
    position: {
      x: pose.position.x + geometry.centerOffset.x * cosine - geometry.centerOffset.y * sine,
      y: pose.position.y + geometry.centerOffset.x * sine + geometry.centerOffset.y * cosine,
    },
    radius: Math.max(geometry.radiusX, geometry.radiusY),
  };
}

/** Adapter for the existing asteroid route graph, never passed to collision physics. */
export function trafficRouteBodies(obstacles: readonly FieldRouteObstacle[]): LocalAsteroid[] {
  return obstacles.map((obstacle) => ({
    id: 'traffic:' + obstacle.id,
    kind: 'resource',
    position: { ...obstacle.position },
    radius: obstacle.radius,
    routeBlocking: true,
    rotation: 0,
    physics: {
      mass: 0,
      momentOfInertia: 0,
      centerOfMassOffset: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
    },
    deposits: [],
    scanLevel: 'unscanned',
  }));
}

type FieldTrafficProvider = (excludedId: string) => readonly FieldRouteObstacle[];

// Field instances are authoritative. Providers read live poses and never own physics.
const providers = new WeakMap<object, FieldTrafficProvider>();

export function bindFieldTraffic(field: object, provider: FieldTrafficProvider): void {
  providers.set(field, provider);
}

export function fieldTrafficObstacles(
  field: object,
  excludedId: string
): readonly FieldRouteObstacle[] {
  return providers.get(field)?.(excludedId) ?? [];
}
