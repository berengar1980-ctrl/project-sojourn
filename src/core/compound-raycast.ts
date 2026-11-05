import type { WorldPoint } from './world-types';
import { asteroidContactProfile, type RockContactShape } from './asteroid-contact-profile';

export interface SegmentRock {
  readonly id: string;
  readonly kind: 'resource' | 'debris';
  readonly position: WorldPoint;
  readonly rotation: number;
  readonly radius: number;
  readonly collisionRadius?: number;
}

export interface RockRayHit {
  readonly point: WorldPoint;
  readonly t: number;
}

function rotate(point: WorldPoint, angle: number): WorldPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
}

function intersectionTime(
  start: WorldPoint,
  delta: WorldPoint,
  radiusX: number,
  radiusY: number
): number | null {
  const sx = start.x / radiusX;
  const sy = start.y / radiusY;
  const dx = delta.x / radiusX;
  const dy = delta.y / radiusY;
  const a = dx * dx + dy * dy;
  if (a <= 1e-12) return null;
  const b = 2 * (sx * dx + sy * dy);
  const c = sx * sx + sy * sy - 1;
  if (c <= 0) return 0;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function shapeTime(from: WorldPoint, delta: WorldPoint, shape: RockContactShape): number | null {
  const translated = { x: from.x - shape.x, y: from.y - shape.y };
  if (shape.kind === 'circle') {
    return intersectionTime(translated, delta, shape.radius, shape.radius);
  }
  const local = rotate(translated, -shape.angle);
  const direction = rotate(delta, -shape.angle);
  return intersectionTime(local, direction, shape.radiusX, shape.radiusY);
}

/**
 * Raycast actual rotating rock solids rather than the broad-phase disk.
 * The normalized shapes are the exact same cached profile as solid collisions.
 */
export function segmentRockHit(
  from: WorldPoint,
  to: WorldPoint,
  rock: SegmentRock
): RockRayHit | null {
  const radius = rock.radius;
  if (radius <= 0) return null;
  const worldDirection = { x: to.x - from.x, y: to.y - from.y };
  const lengthSquared = worldDirection.x ** 2 + worldDirection.y ** 2;
  if (lengthSquared <= 1e-9) return null;

  // Inexpensive nearest-segment broad phase, also valid when the ray begins
  // inside the containing disk and never intersects the outer circle.
  const tClosest = Math.max(
    0,
    Math.min(
      1,
      ((rock.position.x - from.x) * worldDirection.x +
        (rock.position.y - from.y) * worldDirection.y) /
        lengthSquared
    )
  );
  const gapX = from.x + worldDirection.x * tClosest - rock.position.x;
  const gapY = from.y + worldDirection.y * tClosest - rock.position.y;
  const bound = rock.collisionRadius ?? radius;
  if (gapX * gapX + gapY * gapY > bound * bound) return null;

  const localFrom = rotate(
    {
      x: (from.x - rock.position.x) / radius,
      y: (from.y - rock.position.y) / radius,
    },
    -rock.rotation
  );
  const localDelta = rotate(
    { x: worldDirection.x / radius, y: worldDirection.y / radius },
    -rock.rotation
  );

  let first: number | null = null;
  for (const shape of asteroidContactProfile(rock.id, rock.kind)) {
    const t = shapeTime(localFrom, localDelta, shape);
    if (t !== null && (first === null || t < first)) first = t;
  }
  if (first === null) return null;
  return {
    t: first,
    point: {
      x: from.x + worldDirection.x * first,
      y: from.y + worldDirection.y * first,
    },
  };
}
