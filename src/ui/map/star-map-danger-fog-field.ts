import type { WorldPoint, WorldRegion } from '../../core/world-types';
import { distanceToDangerCorridor } from '../../systems/navigation/fixed-danger-geography';

export interface DangerFogSample {
  readonly green: number;
  readonly yellow: number;
  readonly red: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const fraction = clamp01((value - edge0) / (edge1 - edge0));
  return fraction * fraction * (3 - 2 * fraction);
}

/**
 * Warp the same immutable zone geometry with slow, overlapping waves.
 * Only visualization is warped: route selection, piracy and location danger are not.
 */
function warpedPoint(point: WorldPoint): WorldPoint {
  const { x, y } = point;
  const driftX =
    Math.sin(x * 0.0031 + y * 0.0018) * Math.cos(x * 0.0023 - y * 0.0037) * 120 +
    Math.sin(x * 0.0094 - y * 0.0061) * 34;
  const driftY =
    Math.cos(y * 0.0039 - x * 0.0022) * Math.sin(y * 0.0027 + x * 0.0013) * 106 +
    Math.sin(y * 0.0083 + x * 0.0048) * 31;
  return { x: x + driftX, y: y + driftY };
}

type FogBounds = readonly [number, number, number, number];
const fogBounds = new WeakMap<WorldRegion, FogBounds>();

function regionFogBounds(region: WorldRegion): FogBounds {
  const cached = fogBounds.get(region);
  if (cached) return cached;
  const scale = region.scale ?? 1;
  const feather = 1.45;
  const warp = 170;
  let minX = region.center.x - region.radius * feather;
  let minY = region.center.y - region.radius * feather;
  let maxX = region.center.x + region.radius * feather;
  let maxY = region.center.y + region.radius * feather;
  for (const lobe of region.lobes ?? []) {
    minX = Math.min(minX, lobe.center.x - lobe.radiusX * scale * feather);
    minY = Math.min(minY, lobe.center.y - lobe.radiusY * scale * feather);
    maxX = Math.max(maxX, lobe.center.x + lobe.radiusX * scale * feather);
    maxY = Math.max(maxY, lobe.center.y + lobe.radiusY * scale * feather);
  }
  for (const lane of region.corridors ?? []) {
    const radius = lane.width * scale * feather;
    minX = Math.min(minX, lane.from.x - radius, lane.to.x - radius);
    minY = Math.min(minY, lane.from.y - radius, lane.to.y - radius);
    maxX = Math.max(maxX, lane.from.x + radius, lane.to.x + radius);
    maxY = Math.max(maxY, lane.from.y + radius, lane.to.y + radius);
  }
  const bounds: FogBounds = [minX - warp, minY - warp, maxX + warp, maxY + warp];
  fogBounds.set(region, bounds);
  return bounds;
}

/** Feathered elliptical lobe or thick shipping lane; never a hard bitmap category. */
function regionFogInfluence(region: WorldRegion, point: WorldPoint): number {
  const [minX, minY, maxX, maxY] = regionFogBounds(region);
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return 0;
  const scale = region.scale ?? 1;
  if (!region.lobes?.length && !region.corridors?.length) {
    const distance = Math.hypot(point.x - region.center.x, point.y - region.center.y);
    return 1 - smoothstep(0.56, 1.38, distance / Math.max(1, region.radius));
  }

  let influence = 0;
  for (const lobe of region.lobes ?? []) {
    const dx = (point.x - lobe.center.x) / Math.max(1, lobe.radiusX * scale);
    const dy = (point.y - lobe.center.y) / Math.max(1, lobe.radiusY * scale);
    const distance = Math.hypot(dx, dy);
    influence = Math.max(influence, 1 - smoothstep(0.53, 1.36, distance));
  }
  for (const lane of region.corridors ?? []) {
    const distance =
      distanceToDangerCorridor(point, lane.from, lane.to) / Math.max(1, lane.width * scale);
    influence = Math.max(influence, 1 - smoothstep(0.46, 1.43, distance));
  }
  return influence;
}

/**
 * Fog colors interpolate through the same lobes/corridors as fixedDangerAtPoint.
 * Explicit red pirate pockets REMOVE green/yellow mist, rather than drawing dark
 * red circles on top of the already red world background.
 */
export function sampleDangerFog(
  regions: readonly WorldRegion[],
  worldPoint: WorldPoint
): DangerFogSample {
  const point = warpedPoint(worldPoint);
  let green = 0;
  let yellow = 0;
  let red = 0;

  for (const region of regions) {
    const strength = regionFogInfluence(region, point);
    if (strength <= 0) continue;
    if (region.dangerLevel === 1) green = Math.max(green, strength);
    else if (region.dangerLevel === 2) yellow = Math.max(yellow, strength);
    else if (region.dangerLevel === 3) red = Math.max(red, strength);
  }

  // Soft priority: pirate regions are red interruptions in the shipping corridors.
  const cutout = 1 - red;
  const wisps =
    0.88 +
    0.08 * Math.sin(worldPoint.x * 0.0064 + worldPoint.y * 0.0049) +
    0.04 * Math.cos(worldPoint.x * 0.0128 - worldPoint.y * 0.0077);
  return {
    green: clamp01(green * cutout * wisps),
    yellow: clamp01(yellow * cutout * (1 - green * 0.4) * wisps),
    red: clamp01(red * wisps),
  };
}
