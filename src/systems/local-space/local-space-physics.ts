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
  asteroid.physics.angularVelocity +=
    cross(lever, impulse) / asteroid.physics.momentOfInertia;
}

function integrateAxis(
  position: number,
  velocity: number,
  radius: number,
  extent: number
): { position: number; velocity: number } {
  const minimum = radius;
  const maximum = extent - radius;

  if (position < minimum) {
    return { position: minimum, velocity: Math.abs(velocity) * 0.58 };
  }
  if (position > maximum) {
    return { position: maximum, velocity: -Math.abs(velocity) * 0.58 };
  }
  return { position, velocity };
}

export function integrateAsteroids(
  asteroids: readonly LocalAsteroid[],
  deltaSeconds: number,
  width: number,
  height: number
): void {
  for (const asteroid of asteroids) {
    const nextX = asteroid.position.x + asteroid.physics.velocity.x * deltaSeconds;
    const nextY = asteroid.position.y + asteroid.physics.velocity.y * deltaSeconds;
    const x = integrateAxis(nextX, asteroid.physics.velocity.x, asteroid.radius, width);
    const y = integrateAxis(nextY, asteroid.physics.velocity.y, asteroid.radius, height);

    asteroid.position = { x: x.position, y: y.position };
    asteroid.physics.velocity = { x: x.velocity, y: y.velocity };
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
