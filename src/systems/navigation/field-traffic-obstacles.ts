import type { LocalAsteroid } from '../../core/local-space-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { rotatePoint } from '../../core/field-geometry';
import { shipShieldGeometry } from '../../core/ship-contact-geometry';
import type { FieldRouteObstacle } from './field-ship-routing';

/** Navigation only. The real ship remains owned by its normal physics service. */
export function shipTrafficObstacle(
  id: string,
  ship: ShipDefinition,
  pose: {
    readonly position: WorldPoint;
    readonly headingRadians: number;
    readonly speed?: number;
  }
): FieldRouteObstacle {
  const geometry = shipShieldGeometry(ship);
  const offset = rotatePoint(geometry.centerOffset, pose.headingRadians);
  const velocity = rotatePoint({ x: pose.speed ?? 0, y: 0 }, pose.headingRadians);
  return {
    id,
    position: {
      x: pose.position.x + offset.x,
      y: pose.position.y + offset.y,
    },
    radius: Math.max(geometry.radiusX, geometry.radiusY),
    velocity,
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

export type FieldTrafficProvider = (excludedId: string) => readonly FieldRouteObstacle[];

// Field instances are authoritative. Providers read live poses and never own physics.
const providers = new WeakMap<object, FieldTrafficProvider>();

export function bindFieldTraffic(field: object, provider: FieldTrafficProvider): void {
  providers.set(field, provider);
}

export function fieldTrafficProvider(field: object): FieldTrafficProvider | undefined {
  return providers.get(field);
}

export function fieldTrafficObstacles(
  field: object,
  excludedId: string
): readonly FieldRouteObstacle[] {
  return providers.get(field)?.(excludedId) ?? [];
}
