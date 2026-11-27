import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

function cross(a: WorldPoint, b: WorldPoint): number {
  return a.x * b.y - a.y * b.x;
}

function rotate(point: WorldPoint, angle: number): WorldPoint {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

function centerOfMassWorld(asteroid: LocalAsteroid): WorldPoint {
  const offset = rotate(asteroid.physics.centerOfMassOffset, asteroid.rotation);
  return {
    x: asteroid.position.x + offset.x,
    y: asteroid.position.y + offset.y,
  };
}

export function pointVelocity(asteroid: LocalAsteroid, point: WorldPoint): WorldPoint {
  const centerOfMass = centerOfMassWorld(asteroid);
  const lever = {
    x: point.x - centerOfMass.x,
    y: point.y - centerOfMass.y,
  };

  return {
    x: asteroid.physics.velocity.x - asteroid.physics.angularVelocity * lever.y,
    y: asteroid.physics.velocity.y + asteroid.physics.angularVelocity * lever.x,
  };
}

export function applyImpulseAtPoint(
  asteroid: LocalAsteroid,
  impulse: WorldPoint,
  point: WorldPoint
): void {
  const inverseMass = 1 / asteroid.physics.mass;
  asteroid.physics.velocity = {
    x: asteroid.physics.velocity.x + impulse.x * inverseMass,
    y: asteroid.physics.velocity.y + impulse.y * inverseMass,
  };

  const centerOfMass = centerOfMassWorld(asteroid);
  const lever = {
    x: point.x - centerOfMass.x,
    y: point.y - centerOfMass.y,
  };
  asteroid.physics.angularVelocity += cross(lever, impulse) / asteroid.physics.momentOfInertia;
}

export function integrateAsteroids(
  asteroids: readonly LocalAsteroid[],
  deltaSeconds: number,
  width: number,
  height: number
): void {
  for (const asteroid of asteroids) {
    let vx = asteroid.physics.velocity.x;
    let vy = asteroid.physics.velocity.y;
    let x = asteroid.position.x + vx * deltaSeconds;
    let y = asteroid.position.y + vy * deltaSeconds;
    const radius = asteroid.radius;
    // Preserve the old boundary precedence and arithmetic; avoid two temporary axis objects.
    if (x < radius) {
      x = radius;
      vx = Math.abs(vx) * 0.58;
    } else if (x > width - radius) {
      x = width - radius;
      vx = -Math.abs(vx) * 0.58;
    }
    if (y < radius) {
      y = radius;
      vy = Math.abs(vy) * 0.58;
    } else if (y > height - radius) {
      y = height - radius;
      vy = -Math.abs(vy) * 0.58;
    }
    asteroid.position = { x, y };
    asteroid.physics.velocity = { x: vx, y: vy };
    asteroid.rotation += asteroid.physics.angularVelocity * deltaSeconds;
  }
}

export function rotationalMassTerm(
  asteroid: LocalAsteroid,
  contactPoint: WorldPoint,
  normal: WorldPoint
): number {
  const centerOfMass = centerOfMassWorld(asteroid);
  const lever = {
    x: contactPoint.x - centerOfMass.x,
    y: contactPoint.y - centerOfMass.y,
  };
  const leverCrossNormal = cross(lever, normal);
  return (leverCrossNormal * leverCrossNormal) / asteroid.physics.momentOfInertia;
}
