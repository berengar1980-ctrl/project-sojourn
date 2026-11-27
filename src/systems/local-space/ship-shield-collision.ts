import { DRONE_SHIELD_RADIUS_METERS, isSecurityDrone } from '../../core/security-drone';
import type { LocalShipState } from '../../core/local-space-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { contactAxis, rotatePoint as rotate } from '../../core/field-geometry';
import {
  shieldWorldCenter,
  shipShieldGeometry,
  weightedContactSeparation,
} from '../../core/ship-contact-geometry';

export interface LocalShieldShipBody {
  readonly id: string;
  readonly ship: ShipDefinition;
  readonly state: Pick<LocalShipState, 'position' | 'headingRadians'>;
  readonly pushWeight?: number;
}

export interface ShipShieldCollision {
  readonly firstId: string;
  readonly secondId: string;
  readonly point: WorldPoint;
  readonly normal: WorldPoint;
  readonly closingDistance: number;
}

function maximumShieldRadius(body: LocalShieldShipBody): number {
  if (isSecurityDrone(body.id)) return DRONE_SHIELD_RADIUS_METERS;
  const geometry = shipShieldGeometry(body.ship);
  return Math.max(0.01, Math.abs(geometry.radiusX), Math.abs(geometry.radiusY));
}

function shieldCenter(body: LocalShieldShipBody): WorldPoint {
  if (isSecurityDrone(body.id)) return body.state.position;
  const geometry = shipShieldGeometry(body.ship);
  return shieldWorldCenter(body.state.position, body.state.headingRadians, geometry);
}

function supportRadius(body: LocalShieldShipBody, directionWorld: WorldPoint): number {
  if (isSecurityDrone(body.id)) return DRONE_SHIELD_RADIUS_METERS;
  const geometry = shipShieldGeometry(body.ship);
  const direction = rotate(directionWorld, -body.state.headingRadians);
  const length = Math.max(0.0001, Math.hypot(direction.x, direction.y));
  const ux = direction.x / length;
  const uy = direction.y / length;
  const denominator = Math.sqrt(
    (ux * ux) / Math.max(0.0001, geometry.radiusX * geometry.radiusX) +
      (uy * uy) / Math.max(0.0001, geometry.radiusY * geometry.radiusY)
  );
  return denominator > 0 ? 1 / denominator : Math.max(geometry.radiusX, geometry.radiusY);
}

function collisionPoint(
  a: WorldPoint,
  b: WorldPoint,
  normal: WorldPoint,
  radius: number
): WorldPoint {
  return {
    x: a.x + normal.x * radius,
    y: a.y + normal.y * radius,
  };
}

export function resolveShipShieldCollisions(
  bodies: readonly LocalShieldShipBody[],
  shouldCollide: (firstId: string, secondId: string) => boolean = () => true
): readonly ShipShieldCollision[] {
  const impacts: ShipShieldCollision[] = [];

  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const first = bodies[firstIndex]!;
      const second = bodies[secondIndex]!;
      if (!shouldCollide(first.id, second.id)) continue;
      const firstCenter = shieldCenter(first);
      const secondCenter = shieldCenter(second);
      const dx = secondCenter.x - firstCenter.x;
      const dy = secondCenter.y - firstCenter.y;
      const maximum = maximumShieldRadius(first) + maximumShieldRadius(second);
      if (dx * dx + dy * dy > (maximum + 0.000001) ** 2) continue;
      const { distance, normal } = contactAxis(dx, dy);
      const firstRadius = supportRadius(first, normal);
      const secondRadius = supportRadius(second, { x: -normal.x, y: -normal.y });
      const required = firstRadius + secondRadius;
      if (distance >= required) continue;

      const overlap = required - distance + 0.5;
      const firstWeight = Math.max(0.05, first.pushWeight ?? 1);
      const secondWeight = Math.max(0.05, second.pushWeight ?? 1);
      const { first: firstMove, second: secondMove } = weightedContactSeparation(
        overlap,
        firstWeight,
        secondWeight
      );

      first.state.position = {
        x: first.state.position.x - normal.x * firstMove,
        y: first.state.position.y - normal.y * firstMove,
      };
      second.state.position = {
        x: second.state.position.x + normal.x * secondMove,
        y: second.state.position.y + normal.y * secondMove,
      };

      impacts.push({
        firstId: first.id,
        secondId: second.id,
        point: collisionPoint(firstCenter, secondCenter, normal, firstRadius),
        normal,
        closingDistance: overlap,
      });
    }
  }

  return impacts;
}

export interface ShieldCircleObstacle {
  readonly id: string;
  readonly position: WorldPoint;
  readonly radius: number;
}

export interface ShipObstacleCollision {
  readonly shipId: string;
  readonly obstacleId: string;
  readonly point: WorldPoint;
  readonly normal: WorldPoint;
  readonly closingDistance: number;
}

export function resolveShipShieldObstacleCollisions(
  bodies: readonly LocalShieldShipBody[],
  obstacles: readonly ShieldCircleObstacle[]
): readonly ShipObstacleCollision[] {
  const impacts: ShipObstacleCollision[] = [];

  for (const body of bodies) {
    for (const obstacle of obstacles) {
      const center = shieldCenter(body);
      const dx = obstacle.position.x - center.x;
      const dy = obstacle.position.y - center.y;
      const maximum = maximumShieldRadius(body) + Math.max(0, obstacle.radius);
      if (dx * dx + dy * dy > (maximum + 0.000001) ** 2) continue;
      const { distance, normal: towardObstacle } = contactAxis(dx, dy);
      const shieldRadius = supportRadius(body, towardObstacle);
      const required = shieldRadius + Math.max(0, obstacle.radius);
      if (distance >= required) continue;

      const overlap = required - distance + 0.5;
      body.state.position = {
        x: body.state.position.x - towardObstacle.x * overlap,
        y: body.state.position.y - towardObstacle.y * overlap,
      };

      impacts.push({
        shipId: body.id,
        obstacleId: obstacle.id,
        point: {
          x: obstacle.position.x - towardObstacle.x * obstacle.radius,
          y: obstacle.position.y - towardObstacle.y * obstacle.radius,
        },
        normal: { x: -towardObstacle.x, y: -towardObstacle.y },
        closingDistance: overlap,
      });
    }
  }

  return impacts;
}
