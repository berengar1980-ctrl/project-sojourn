import type { LocalAsteroid } from '../../core/local-space-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { pointToSegmentDistanceSquared, rotatePoint } from '../../core/field-geometry';
import { shieldWorldCenter, shipShieldGeometry } from '../../core/ship-contact-geometry';
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
  const velocity = rotatePoint({ x: pose.speed ?? 0, y: 0 }, pose.headingRadians);
  return {
    id,
    position: shieldWorldCenter(pose.position, pose.headingRadians, geometry),
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

const origin = { x: 0, y: 0 };
const TRAFFIC_LOOKAHEAD_SECONDS = 0.75;

function relativeMotionClear(
  start: WorldPoint,
  displacement: WorldPoint,
  velocity: WorldPoint,
  seconds: number,
  radius: number
): boolean {
  const dx = displacement.x - velocity.x * seconds;
  const dy = displacement.y - velocity.y * seconds;
  const gapSquared = start.x * start.x + start.y * start.y;
  if (gapSquared < radius * radius) {
    // Permit an existing contact to separate, but not a deeper penetration.
    return start.x * dx + start.y * dy >= 0;
  }
  const end = { x: start.x + dx, y: start.y + dy };
  return pointToSegmentDistanceSquared(origin, start, end) >= radius * radius;
}

function trafficContactAllowsStep(
  from: WorldPoint,
  to: WorldPoint,
  seconds: number,
  clearance: number,
  obstacle: FieldRouteObstacle
): boolean {
  const velocity = obstacle.velocity;
  if (!velocity) return true;
  const start = { x: from.x - obstacle.position.x, y: from.y - obstacle.position.y };
  const displacement = { x: to.x - from.x, y: to.y - from.y };
  const radius = obstacle.radius + clearance;
  const horizon = Math.max(seconds, TRAFFIC_LOOKAHEAD_SECONDS);
  // Cheap conservative broad phase; never project distant ships.
  const reach =
    radius +
    Math.hypot(displacement.x, displacement.y) * (horizon / seconds) +
    Math.hypot(velocity.x, velocity.y) * horizon;
  if (start.x * start.x + start.y * start.y > reach * reach) return true;
  if (!relativeMotionClear(start, displacement, velocity, seconds, radius)) return false;
  if (velocity.x === 0 && velocity.y === 0) return true;
  const projected = {
    x: displacement.x * (horizon / seconds),
    y: displacement.y * (horizon / seconds),
  };
  // Yield to crossing traffic only when waiting is safer than continuing.
  // Head-on encounters still use the normal geometric detour planner.
  return (
    relativeMotionClear(start, projected, velocity, horizon, radius) ||
    !relativeMotionClear(start, origin, velocity, horizon, radius)
  );
}

/** Keep the existing route while yielding; never move a second physics body. */
export function trafficStepClear(
  from: WorldPoint,
  to: WorldPoint,
  seconds: number,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number
): boolean {
  if (seconds <= 0) return true;
  return obstacles.every((obstacle) =>
    trafficContactAllowsStep(from, to, seconds, clearance, obstacle)
  );
}
