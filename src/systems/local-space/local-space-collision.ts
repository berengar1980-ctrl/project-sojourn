import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';

export interface ShieldWorldGeometry {
  readonly centerOffset: WorldPoint;
  readonly radiusX: number;
  readonly radiusY: number;
}

function rotate(point: WorldPoint, angle: number): WorldPoint {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

export function createShieldWorldGeometry(
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number
): ShieldWorldGeometry {
  const scale = nominalLengthMeters / hardpoints.sourceWidth;
  return {
    centerOffset: {
      x: (hardpoints.shield.centerX - hardpoints.sourceWidth / 2) * scale,
      y: (hardpoints.shield.centerY - hardpoints.sourceHeight / 2) * scale,
    },
    radiusX: hardpoints.shield.radiusX * scale,
    radiusY: hardpoints.shield.radiusY * scale,
  };
}

function shieldCenter(ship: LocalShipState, shield: ShieldWorldGeometry): WorldPoint {
  const offset = rotate(shield.centerOffset, ship.headingRadians);
  return {
    x: ship.position.x + offset.x,
    y: ship.position.y + offset.y,
  };
}

function collisionMetric(
  local: WorldPoint,
  asteroidRadius: number,
  shield: ShieldWorldGeometry
): number {
  const radiusX = shield.radiusX + asteroidRadius;
  const radiusY = shield.radiusY + asteroidRadius;
  return Math.hypot(local.x / radiusX, local.y / radiusY);
}

export function resolveShieldCollisions(
  ship: LocalShipState,
  asteroids: readonly LocalAsteroid[],
  shield: ShieldWorldGeometry
): boolean {
  const center = shieldCenter(ship, shield);
  let collided = false;

  for (const asteroid of asteroids) {
    const relative = {
      x: asteroid.position.x - center.x,
      y: asteroid.position.y - center.y,
    };
    const local = rotate(relative, -ship.headingRadians);
    const metric = collisionMetric(local, asteroid.radius, shield);
    if (metric > 1) continue;

    const length = Math.max(0.001, Math.hypot(relative.x, relative.y));
    const normal = { x: relative.x / length, y: relative.y / length };
    const penetration = Math.max(2, (1 - metric) * (asteroid.radius + shield.radiusY));
    asteroid.position = {
      x: asteroid.position.x + normal.x * penetration,
      y: asteroid.position.y + normal.y * penetration,
    };
    asteroid.velocity = {
      x: asteroid.velocity.x + normal.x * 165,
      y: asteroid.velocity.y + normal.y * 165,
    };
    collided = true;
  }

  return collided;
}

export function updateAsteroidMotion(
  asteroids: readonly LocalAsteroid[],
  deltaSeconds: number,
  width: number,
  height: number
): void {
  const damping = Math.pow(0.18, deltaSeconds);

  for (const asteroid of asteroids) {
    asteroid.position = {
      x: Math.min(
        width - asteroid.radius,
        Math.max(asteroid.radius, asteroid.position.x + asteroid.velocity.x * deltaSeconds)
      ),
      y: Math.min(
        height - asteroid.radius,
        Math.max(asteroid.radius, asteroid.position.y + asteroid.velocity.y * deltaSeconds)
      ),
    };
    asteroid.velocity = {
      x: asteroid.velocity.x * damping,
      y: asteroid.velocity.y * damping,
    };
  }
}
