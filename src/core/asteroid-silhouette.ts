import type { WorldPoint } from './world-types';

/** Procedural rock contour shared by renderer and physics; same seeded silhouette. */
export function hashAsteroidSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function asteroidRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAsteroidOutline(
  kind: 'resource' | 'debris',
  random: () => number
): WorldPoint[] {
  const vertices = kind === 'debris' ? 12 : 24;
  const family = random();
  // The longest dimension stays within the nominal sprite radius. The
  // other axis varies by family, creating actual oblong/compact silhouettes.
  const stretchX = kind === 'debris' || family < 0.4 ? 1 : family < 0.7 ? 0.73 : 0.88;
  const stretchY = kind === 'debris' || family < 0.4 ? 1 : family < 0.7 ? 1 : 0.65;
  const outline: WorldPoint[] = [];
  for (let index = 0; index < vertices; index += 1) {
    const angle = (index / vertices) * Math.PI * 2;
    const broad = Math.sin(angle * 2 + random() * 0.8) * 0.035;
    const radius = 0.79 + random() * 0.2 + broad;
    outline.push({
      x: Math.cos(angle) * radius * stretchX,
      y: Math.sin(angle) * radius * stretchY,
    });
  }
  return outline;
}

/** The renderer traces quadratic curves between midpoints. Find the disk that
 * is guaranteed to remain INSIDE that exact silhouette, rather than colliding
 * with the much larger nominal texture square. Calculated once per rock ID.
 */
export function asteroidSilhouetteInradius(id: string, kind: 'resource' | 'debris'): number {
  const random = asteroidRandom(hashAsteroidSeed(id + ':' + kind));
  const outline = createAsteroidOutline(kind, random);
  let minimum = Infinity;
  for (let index = 0; index < outline.length; index += 1) {
    const previous = outline[(index + outline.length - 1) % outline.length]!;
    const current = outline[index]!;
    const next = outline[(index + 1) % outline.length]!;
    const start = { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 };
    const end = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    for (let step = 0; step <= 12; step += 1) {
      const t = step / 12;
      const u = 1 - t;
      const x = u * u * start.x + 2 * u * t * current.x + t * t * end.x;
      const y = u * u * start.y + 2 * u * t * current.y + t * t * end.y;
      minimum = Math.min(minimum, Math.hypot(x, y));
    }
  }
  return minimum;
}
