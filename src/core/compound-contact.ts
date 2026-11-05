import type { WorldPoint } from './world-types';
import { asteroidContactProfile, type RockContactShape } from './asteroid-contact-profile';

export interface ContactBody {
  readonly position: WorldPoint;
  readonly angle: number;
  readonly shapes: readonly RockContactShape[];
  readonly bound: number;
}

export interface Contact {
  /** Unit normal from the first body toward the second. */
  readonly normal: WorldPoint;
  readonly depth: number;
  readonly point: WorldPoint;
}

export interface RockContactData {
  readonly id: string;
  readonly kind: 'resource' | 'debris';
  readonly position: WorldPoint;
  readonly rotation: number;
  readonly radius: number;
  readonly collisionRadius?: number;
  readonly contactGeometry?: 'silhouette';
}

const SEGMENTS = 20;

function rotate(x: number, y: number, angle: number): WorldPoint {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

function polygon(body: ContactBody, shape: RockContactShape): WorldPoint[] {
  const center = rotate(shape.x, shape.y, body.angle);
  const cx = body.position.x + center.x;
  const cy = body.position.y + center.y;
  const phase = body.angle + (shape.kind === 'ellipse' ? shape.angle : 0);
  const vertices: WorldPoint[] = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    const x = Math.cos(theta) * (shape.kind === 'circle' ? shape.radius : shape.radiusX);
    const y = Math.sin(theta) * (shape.kind === 'circle' ? shape.radius : shape.radiusY);
    const point = rotate(x, y, phase);
    vertices.push({ x: cx + point.x, y: cy + point.y });
  }
  return vertices;
}

function project(points: readonly WorldPoint[], normal: WorldPoint): [number, number] {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const p of points) {
    const value = p.x * normal.x + p.y * normal.y;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return [minimum, maximum];
}

function midpoint(points: readonly WorldPoint[]): WorldPoint {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function support(points: readonly WorldPoint[], normal: WorldPoint): WorldPoint {
  let best = points[0]!;
  let distance = -Infinity;
  for (const point of points) {
    const value = point.x * normal.x + point.y * normal.y;
    if (value > distance) {
      best = point;
      distance = value;
    }
  }
  return best;
}

function polygonContact(a: readonly WorldPoint[], b: readonly WorldPoint[]): Contact | null {
  let depth = Infinity;
  let axis = { x: 1, y: 0 };
  for (const points of [a, b]) {
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i]!;
      const next = points[(i + 1) % points.length]!;
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const length = Math.hypot(dx, dy) || 1;
      const normal = { x: -dy / length, y: dx / length };
      const [minA, maxA] = project(a, normal);
      const [minB, maxB] = project(b, normal);
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return null;
      if (overlap < depth) {
        depth = overlap;
        axis = normal;
      }
    }
  }
  const centerA = midpoint(a);
  const centerB = midpoint(b);
  if ((centerB.x - centerA.x) * axis.x + (centerB.y - centerA.y) * axis.y < 0) {
    axis = { x: -axis.x, y: -axis.y };
  }
  const fromA = support(a, axis);
  const fromB = support(b, { x: -axis.x, y: -axis.y });
  return {
    normal: axis,
    depth,
    point: { x: (fromA.x + fromB.x) * 0.5, y: (fromA.y + fromB.y) * 0.5 },
  };
}

/** Fast broad phase, then SAT over the small number of overlapping solids. */
export function compoundContact(first: ContactBody, second: ContactBody): Contact | null {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const bound = first.bound + second.bound;
  if (dx * dx + dy * dy >= bound * bound) return null;

  let strongest: Contact | null = null;
  for (const shapeA of first.shapes) {
    const a = polygon(first, shapeA);
    for (const shapeB of second.shapes) {
      const contact = polygonContact(a, polygon(second, shapeB));
      if (contact && (!strongest || contact.depth > strongest.depth)) strongest = contact;
    }
  }
  return strongest;
}

export function rockContactBody(rock: RockContactData): ContactBody {
  const scale = rock.radius;
  const shapes: readonly RockContactShape[] =
    rock.contactGeometry === 'silhouette'
      ? asteroidContactProfile(rock.id, rock.kind)
      : [{ kind: 'circle', x: 0, y: 0, radius: (rock.collisionRadius ?? scale) / scale }];

  const scaled: RockContactShape[] = shapes.map((shape) =>
    shape.kind === 'circle'
      ? {
          ...shape,
          x: shape.x * scale,
          y: shape.y * scale,
          radius: shape.radius * scale,
        }
      : {
          ...shape,
          x: shape.x * scale,
          y: shape.y * scale,
          radiusX: shape.radiusX * scale,
          radiusY: shape.radiusY * scale,
        }
  );
  const bound = Math.max(
    ...scaled.map(
      (shape) =>
        Math.hypot(shape.x, shape.y) +
        (shape.kind === 'circle' ? shape.radius : Math.max(shape.radiusX, shape.radiusY))
    )
  );
  return { position: rock.position, angle: rock.rotation, shapes: scaled, bound };
}

export function shieldContactBody(
  position: WorldPoint,
  angle: number,
  radiusX: number,
  radiusY: number
): ContactBody {
  return {
    position,
    angle,
    shapes: [{ kind: 'ellipse', x: 0, y: 0, radiusX, radiusY, angle: 0 }],
    bound: Math.max(radiusX, radiusY),
  };
}
