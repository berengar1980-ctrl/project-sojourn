import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import { rotatePoint as rotate } from '../../core/field-geometry';
import { shieldWorldCenter, type ShieldWorldGeometry } from '../../core/ship-contact-geometry';
import type { WorldPoint } from '../../core/world-types';
import { applyImpulseAtPoint, pointVelocity, rotationalMassTerm } from './local-space-physics';
import { localAsteroidContactRadius } from './local-asteroid-footprint';
import { compoundContact, rockContactBody, shieldContactBody } from '../../core/compound-contact';

export { createShieldWorldGeometry } from '../../core/ship-contact-geometry';
export type { ShieldWorldGeometry } from '../../core/ship-contact-geometry';

export interface ShieldCollisionImpact {
  readonly asteroidId: string;
  readonly point: WorldPoint;
  readonly normal: WorldPoint;
  readonly surfaceAnchor: WorldPoint;
  readonly mass: number;
  readonly impactSpeed: number;
  readonly kineticEnergy: number;
}

function dot(a: WorldPoint, b: WorldPoint): number {
  return a.x * b.x + a.y * b.y;
}

function normalized(point: WorldPoint): WorldPoint {
  const length = Math.max(0.001, Math.hypot(point.x, point.y));
  return { x: point.x / length, y: point.y / length };
}

function separationVector(
  local: WorldPoint,
  asteroidRadius: number,
  shield: ShieldWorldGeometry
): WorldPoint {
  const radiusX = shield.radiusX + asteroidRadius;
  const radiusY = shield.radiusY + asteroidRadius;
  const metric = Math.hypot(local.x / radiusX, local.y / radiusY);
  if (metric >= 1) return { x: 0, y: 0 };
  if (metric < 0.0001) return { x: -(radiusX + 2), y: 0 };

  const boundaryScale = 1 / metric;
  return {
    x: local.x * (boundaryScale - 1),
    y: local.y * (boundaryScale - 1),
  };
}

function shieldRestitution(asteroid: LocalAsteroid): number {
  return asteroid.kind === 'debris' ? 0.72 : 0.5;
}

function shieldEnergyBoost(impactSpeed: number, asteroid: LocalAsteroid): number {
  const baseBoost = asteroid.kind === 'debris' ? 1.4 : 0.8;
  return Math.min(4, baseBoost + impactSpeed * 0.05);
}

export function resolveShieldCollisions(
  ship: LocalShipState,
  shipVelocity: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  shield: ShieldWorldGeometry
): ShieldCollisionImpact[] {
  const center = shieldWorldCenter(ship.position, ship.headingRadians, shield);
  const impacts: ShieldCollisionImpact[] = [];

  for (const asteroid of asteroids) {
    const relative = {
      x: asteroid.position.x - center.x,
      y: asteroid.position.y - center.y,
    };
    const contactRadius = localAsteroidContactRadius(asteroid);
    const maximumDistance = contactRadius + Math.max(shield.radiusX, shield.radiusY);
    if (relative.x * relative.x + relative.y * relative.y > maximumDistance * maximumDistance)
      continue;
    const local = rotate(relative, -ship.headingRadians);
    const contact =
      asteroid.contactGeometry === 'silhouette'
        ? compoundContact(
            shieldContactBody(center, ship.headingRadians, shield.radiusX, shield.radiusY),
            rockContactBody(asteroid)
          )
        : null;
    if (asteroid.contactGeometry === 'silhouette' && !contact) continue;
    const separationLocal = contact
      ? rotate(
          {
            x: contact.normal.x * (contact.depth + 0.5),
            y: contact.normal.y * (contact.depth + 0.5),
          },
          -ship.headingRadians
        )
      : separationVector(local, contactRadius, shield);
    if (separationLocal.x === 0 && separationLocal.y === 0) continue;

    const separationWorld = rotate(separationLocal, ship.headingRadians);
    const normal = contact?.normal ?? normalized(separationWorld);
    asteroid.position = {
      x: asteroid.position.x + separationWorld.x,
      y: asteroid.position.y + separationWorld.y,
    };

    const contactPoint = contact?.point ?? {
      x: asteroid.position.x - normal.x * contactRadius,
      y: asteroid.position.y - normal.y * asteroid.radius,
    };
    const localContact = rotate(
      { x: contactPoint.x - center.x, y: contactPoint.y - center.y },
      -ship.headingRadians
    );
    const surfaceMetric =
      Math.hypot(localContact.x / shield.radiusX, localContact.y / shield.radiusY) || 1;
    const surfaceAnchor = {
      x: localContact.x / (surfaceMetric * shield.radiusX),
      y: localContact.y / (surfaceMetric * shield.radiusY),
    };
    const velocityAtContact = pointVelocity(asteroid, contactPoint);
    const relativeVelocity = {
      x: velocityAtContact.x - shipVelocity.x,
      y: velocityAtContact.y - shipVelocity.y,
    };
    const normalVelocity = dot(relativeVelocity, normal);
    const impactSpeed = Math.max(0, -normalVelocity);

    if (impactSpeed > 0.01) {
      impacts.push({
        asteroidId: asteroid.id,
        point: contactPoint,
        normal,
        surfaceAnchor,
        mass: asteroid.physics.mass,
        impactSpeed,
        kineticEnergy: 0.5 * asteroid.physics.mass * impactSpeed * impactSpeed,
      });
    }

    asteroid.position = {
      x: asteroid.position.x + normal.x * 2,
      y: asteroid.position.y + normal.y * 2,
    };

    if (impactSpeed > 0.01) {
      const shipNormalVelocity = dot(shipVelocity, normal);
      const outwardVelocity = dot(velocityAtContact, normal);
      const targetRelativeOutwardSpeed =
        impactSpeed * shieldRestitution(asteroid) + shieldEnergyBoost(impactSpeed, asteroid);
      const targetWorldOutwardSpeed = shipNormalVelocity + targetRelativeOutwardSpeed;
      const requiredDelta = Math.max(0, targetWorldOutwardSpeed - outwardVelocity);
      const impulseMagnitude = requiredDelta * asteroid.physics.mass;
      applyImpulseAtPoint(
        asteroid,
        { x: normal.x * impulseMagnitude, y: normal.y * impulseMagnitude },
        contactPoint
      );
    }
  }

  return impacts;
}

function collisionNormal(a: LocalAsteroid, b: LocalAsteroid): WorldPoint {
  const delta = {
    x: b.position.x - a.position.x,
    y: b.position.y - a.position.y,
  };
  if (Math.hypot(delta.x, delta.y) < 0.001) return { x: 1, y: 0 };
  return normalized(delta);
}

function separatePair(
  a: LocalAsteroid,
  b: LocalAsteroid,
  normal: WorldPoint,
  overlap: number
): void {
  if (overlap <= 0) return;

  const inverseA = 1 / a.physics.mass;
  const inverseB = 1 / b.physics.mass;
  const inverseTotal = inverseA + inverseB;
  const moveA = overlap * (inverseA / inverseTotal);
  const moveB = overlap * (inverseB / inverseTotal);

  a.position = {
    x: a.position.x - normal.x * moveA,
    y: a.position.y - normal.y * moveA,
  };
  b.position = {
    x: b.position.x + normal.x * moveB,
    y: b.position.y + normal.y * moveB,
  };
}

function resolvePairImpulse(
  a: LocalAsteroid,
  b: LocalAsteroid,
  normal: WorldPoint,
  contactPoint: WorldPoint
): void {
  const velocityA = pointVelocity(a, contactPoint);
  const velocityB = pointVelocity(b, contactPoint);
  const relativeVelocity = {
    x: velocityB.x - velocityA.x,
    y: velocityB.y - velocityA.y,
  };
  const closingSpeed = dot(relativeVelocity, normal);
  if (closingSpeed >= 0) return;

  const inverseMass =
    1 / a.physics.mass +
    1 / b.physics.mass +
    rotationalMassTerm(a, contactPoint, normal) +
    rotationalMassTerm(b, contactPoint, normal);
  const restitution = a.kind === 'debris' || b.kind === 'debris' ? 0.32 : 0.22;
  const impulseMagnitude = (-(1 + restitution) * closingSpeed) / inverseMass;
  const impulse = {
    x: normal.x * impulseMagnitude,
    y: normal.y * impulseMagnitude,
  };

  applyImpulseAtPoint(a, { x: -impulse.x, y: -impulse.y }, contactPoint);
  applyImpulseAtPoint(b, impulse, contactPoint);
}

const COLLISION_CELL_SIZE = 160;

function collisionBuckets(asteroids: readonly LocalAsteroid[]): Map<number, Map<number, number[]>> {
  const rows = new Map<number, Map<number, number[]>>();
  asteroids.forEach((asteroid, index) => {
    const column = Math.floor(asteroid.position.x / COLLISION_CELL_SIZE);
    const row = Math.floor(asteroid.position.y / COLLISION_CELL_SIZE);
    let columns = rows.get(row);
    if (!columns) {
      columns = new Map();
      rows.set(row, columns);
    }
    const bucket = columns.get(column);
    if (bucket) bucket.push(index);
    else columns.set(column, [index]);
  });
  return rows;
}

function resolveCollisionPair(a: LocalAsteroid, b: LocalAsteroid): void {
  const maximumDistance = localAsteroidContactRadius(a) + localAsteroidContactRadius(b);
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  if (dx * dx + dy * dy >= maximumDistance * maximumDistance) return;

  const contact =
    a.contactGeometry === 'silhouette' || b.contactGeometry === 'silhouette'
      ? compoundContact(rockContactBody(a), rockContactBody(b))
      : null;
  if ((a.contactGeometry === 'silhouette' || b.contactGeometry === 'silhouette') && !contact)
    return;

  const distance = Math.hypot(dx, dy);
  const normal = contact?.normal ?? collisionNormal(a, b);
  const overlap = contact?.depth ?? maximumDistance - distance;
  const contactPoint = contact?.point ?? {
    x: a.position.x + normal.x * localAsteroidContactRadius(a),
    y: a.position.y + normal.y * localAsteroidContactRadius(a),
  };
  separatePair(a, b, normal, overlap);
  resolvePairImpulse(a, b, normal, contactPoint);
}

export function resolveAsteroidCollisions(asteroids: readonly LocalAsteroid[]): void {
  const buckets = collisionBuckets(asteroids);
  // Standard mining fields use one cell. Large ship sections can overlap
  // objects two cells away; expand only when oversized obstacles exist.
  let maxRadius = 0;
  for (const body of asteroids) {
    maxRadius = Math.max(maxRadius, localAsteroidContactRadius(body));
  }

  asteroids.forEach((asteroid, first) => {
    const column = Math.floor(asteroid.position.x / COLLISION_CELL_SIZE);
    const row = Math.floor(asteroid.position.y / COLLISION_CELL_SIZE);

    const reachDistance = localAsteroidContactRadius(asteroid) + maxRadius;
    const reach = Math.max(1, Math.ceil(reachDistance / COLLISION_CELL_SIZE));
    for (let rowOffset = -reach; rowOffset <= reach; rowOffset += 1) {
      const columns = buckets.get(row + rowOffset);
      if (!columns) continue;
      for (let columnOffset = -reach; columnOffset <= reach; columnOffset += 1) {
        const candidates = columns.get(column + columnOffset);
        if (!candidates) continue;
        for (const second of candidates) {
          if (second <= first) continue;
          resolveCollisionPair(asteroid, asteroids[second]!);
        }
      }
    }
  });
}
