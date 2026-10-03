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

function expandedMetric(
  local: WorldPoint,
  asteroidRadius: number,
  shield: ShieldWorldGeometry
): number {
  const radiusX = shield.radiusX + asteroidRadius;
  const radiusY = shield.radiusY + asteroidRadius;
  return Math.hypot(local.x / radiusX, local.y / radiusY);
}

function separationVector(
  local: WorldPoint,
  asteroidRadius: number,
  shield: ShieldWorldGeometry
): WorldPoint {
  const metric = expandedMetric(local, asteroidRadius, shield);
  if (metric >= 1) return { x: 0, y: 0 };

  if (metric < 0.0001) {
    return { x: -(shield.radiusX + asteroidRadius + 2), y: 0 };
  }

  const boundaryScale = 1 / metric;
  return {
    x: local.x * (boundaryScale - 1),
    y: local.y * (boundaryScale - 1),
  };
}

function normalized(point: WorldPoint): WorldPoint {
  const length = Math.max(0.001, Math.hypot(point.x, point.y));
  return { x: point.x / length, y: point.y / length };
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
    const separationLocal = separationVector(local, asteroid.radius, shield);
    if (separationLocal.x === 0 && separationLocal.y === 0) continue;

    const separationWorld = rotate(separationLocal, ship.headingRadians);
    const normal = normalized(separationWorld);
    asteroid.position = {
      x: asteroid.position.x + separationWorld.x + normal.x * 3,
      y: asteroid.position.y + separationWorld.y + normal.y * 3,
    };

    const outwardSpeed = 250;
    const outwardVelocity = asteroid.velocity.x * normal.x + asteroid.velocity.y * normal.y;
    const requiredImpulse = Math.max(0, outwardSpeed - outwardVelocity);
    asteroid.velocity = {
      x: asteroid.velocity.x + normal.x * requiredImpulse,
      y: asteroid.velocity.y + normal.y * requiredImpulse,
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
  const damping = Math.pow(0.28, deltaSeconds);

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
