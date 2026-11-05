import type { WorldPoint } from './world-types';
import { asteroidRandom, createAsteroidOutline, hashAsteroidSeed } from './asteroid-silhouette';

export type RockContactShape =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly radius: number }
  | {
      readonly kind: 'ellipse';
      readonly x: number;
      readonly y: number;
      readonly radiusX: number;
      readonly radiusY: number;
      readonly angle: number;
    };

const profileCache = new Map<string, readonly RockContactShape[]>();
const MAX_PROFILES = 512;

function curvedOutline(outline: readonly WorldPoint[]): WorldPoint[] {
  const result: WorldPoint[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const prev = outline[(index + outline.length - 1) % outline.length]!;
    const curr = outline[index]!;
    const next = outline[(index + 1) % outline.length]!;
    const ax = (prev.x + curr.x) * 0.5;
    const ay = (prev.y + curr.y) * 0.5;
    const bx = (curr.x + next.x) * 0.5;
    const by = (curr.y + next.y) * 0.5;
    for (let step = 0; step < 8; step += 1) {
      const t = step / 8;
      const u = 1 - t;
      result.push({
        x: u * u * ax + 2 * u * t * curr.x + t * t * bx,
        y: u * u * ay + 2 * u * t * curr.y + t * t * by,
      });
    }
  }
  return result;
}

function inside(point: WorldPoint, outline: readonly WorldPoint[]): boolean {
  let contains = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]!;
    const b = outline[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      contains = !contains;
  }
  return contains;
}

function fits(shape: RockContactShape, outline: readonly WorldPoint[]): boolean {
  for (let i = 0; i < 24; i += 1) {
    const t = (i / 24) * Math.PI * 2;
    let dx: number;
    let dy: number;
    if (shape.kind === 'circle') {
      dx = Math.cos(t) * shape.radius;
      dy = Math.sin(t) * shape.radius;
    } else {
      const ex = Math.cos(t) * shape.radiusX;
      const ey = Math.sin(t) * shape.radiusY;
      dx = ex * Math.cos(shape.angle) - ey * Math.sin(shape.angle);
      dy = ex * Math.sin(shape.angle) + ey * Math.cos(shape.angle);
    }
    if (!inside({ x: shape.x + dx, y: shape.y + dy }, outline)) return false;
  }
  return true;
}

function insideEllipse(point: WorldPoint, shape: RockContactShape): boolean {
  if (shape.kind !== 'ellipse') return false;
  const dx = point.x - shape.x;
  const dy = point.y - shape.y;
  const x = dx * Math.cos(shape.angle) + dy * Math.sin(shape.angle);
  const y = -dx * Math.sin(shape.angle) + dy * Math.cos(shape.angle);
  return (x / shape.radiusX) ** 2 + (y / shape.radiusY) ** 2 <= 1;
}

/** At most three solids, fitted strictly INSIDE the renderer's curved outline. */
export function asteroidContactProfile(
  id: string,
  kind: 'resource' | 'debris'
): readonly RockContactShape[] {
  const key = id + ':' + kind;
  const cached = profileCache.get(key);
  if (cached) return cached;

  const outline = curvedOutline(createAsteroidOutline(kind, asteroidRandom(hashAsteroidSeed(key))));
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const width = (Math.max(...xs) - Math.min(...xs)) / 2;
  const height = (Math.max(...ys) - Math.min(...ys)) / 2;
  const result: RockContactShape[] = [];
  const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
  let ratio = 0.87;
  let main: RockContactShape = {
    kind: 'ellipse',
    x: centerX,
    y: centerY,
    radiusX: width * ratio,
    radiusY: height * ratio,
    angle: 0,
  };
  while (!fits(main, outline) && ratio > 0.45) {
    ratio -= 0.025;
    main = { ...main, radiusX: width * ratio, radiusY: height * ratio };
  }
  result.push(main);

  if (kind === 'resource') {
    // Only add lobe circles when they cover a substantial region NOT already
    // covered by the ellipse. No redundant circle over the same interior.
    const candidates = outline.filter((_, index) => index % 8 === 0);
    let best: RockContactShape | null = null;
    let bestGain = 0;
    for (const tip of candidates) {
      const center = {
        x: centerX + (tip.x - centerX) * 0.67,
        y: centerY + (tip.y - centerY) * 0.67,
      };
      const circle: RockContactShape = {
        kind: 'circle',
        x: center.x,
        y: center.y,
        radius: Math.min(width, height) * 0.22,
      };
      if (!fits(circle, outline)) continue;
      let gain = 0;
      for (let step = 0; step < 16; step += 1) {
        const t = (step / 16) * Math.PI * 2;
        const sample = {
          x: center.x + circle.radius * Math.cos(t),
          y: center.y + circle.radius * Math.sin(t),
        };
        if (!insideEllipse(sample, main)) gain += 1;
      }
      if (gain > bestGain) {
        bestGain = gain;
        best = circle;
      }
    }
    if (best && bestGain >= 6) result.push(best);
  }

  if (profileCache.size >= MAX_PROFILES) profileCache.clear();
  profileCache.set(key, result);
  return result;
}

export function asteroidContactBound(id: string, kind: 'resource' | 'debris'): number {
  return Math.max(
    ...asteroidContactProfile(id, kind).map(
      (shape) =>
        Math.hypot(shape.x, shape.y) +
        (shape.kind === 'circle' ? shape.radius : Math.max(shape.radiusX, shape.radiusY))
    )
  );
}
