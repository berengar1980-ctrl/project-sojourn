import type { LocalShipState } from '../../core/local-space-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { createShieldWorldGeometry } from './local-space-collision';

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

function rotate(point: WorldPoint, angle: number): WorldPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function shieldCenter(body: LocalShieldShipBody): WorldPoint {
  const geometry = createShieldWorldGeometry(body.ship.sprite.hardpoints, body.ship.nominalLengthMeters);
  const offset = rotate(geometry.centerOffset, body.state.headingRadians);
  return {
    x: body.state.position.x + offset.x,
    y: body.state.position.y + offset.y,
  };
}

function supportRadius(body: LocalShieldShipBody, directionWorld: WorldPoint): number {
  const geometry = createShieldWorldGeometry(body.ship.sprite.hardpoints, body.ship.nominalLengthMeters);
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

function collisionPoint(a: WorldPoint, b: WorldPoint, normal: WorldPoint, radius: number): WorldPoint {
  return {
    x: a.x + normal.x * radius,
    y: a.y + normal.y * radius,
  };
}

export function resolveShipShieldCollisions(
  bodies: readonly LocalShieldShipBody[]
): readonly ShipShieldCollision[] {
  const impacts: ShipShieldCollision[] = [];

  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const first = bodies[firstIndex]!;
      const second = bodies[secondIndex]!;
      const firstCenter = shieldCenter(first);
      const secondCenter = shieldCenter(second);
      const dx = secondCenter.x - firstCenter.x;
      const dy = secondCenter.y - firstCenter.y;
      const distance = Math.hypot(dx, dy);
      const normal =
        distance > 0.001 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
      const firstRadius = supportRadius(first, normal);
      const secondRadius = supportRadius(second, { x: -normal.x, y: -normal.y });
      const required = firstRadius + secondRadius;
      if (distance >= required) continue;

      const overlap = required - distance + 0.5;
      const firstWeight = Math.max(0.05, first.pushWeight ?? 1);
      const secondWeight = Math.max(0.05, second.pushWeight ?? 1);
      const totalWeight = firstWeight + secondWeight;
      const firstMove = overlap * (secondWeight / totalWeight);
      const secondMove = overlap * (firstWeight / totalWeight);

      first.state.position.x -= normal.x * firstMove;
      first.state.position.y -= normal.y * firstMove;
      second.state.position.x += normal.x * secondMove;
      second.state.position.y += normal.y * secondMove;

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
