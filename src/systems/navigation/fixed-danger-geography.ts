import type { WorldPoint, WorldRegion } from '../../core/world-types';

/**
 * Static Voidbound-style geography. Later entries take priority:
 * yellow shipping rooms, green settled corridors, then explicit red pirate pockets.
 * This function is used by the map renderer AND the actual navigation cost model.
 */
export function distanceToDangerCorridor(
  point: WorldPoint,
  from: WorldPoint,
  to: WorldPoint
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 0.001) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / d2));
  return Math.hypot(point.x - from.x - dx * t, point.y - from.y - dy * t);
}

export function pointInsideDangerRegion(region: WorldRegion, point: WorldPoint): boolean {
  if (!region.lobes?.length && !region.corridors?.length)
    return Math.hypot(point.x - region.center.x, point.y - region.center.y) <= region.radius;

  const scale = region.scale ?? 1;
  if (
    region.lobes?.some((lobe) => {
      const dx = (point.x - lobe.center.x) / Math.max(1, lobe.radiusX * scale);
      const dy = (point.y - lobe.center.y) / Math.max(1, lobe.radiusY * scale);
      return dx * dx + dy * dy <= 1;
    })
  ) return true;

  return region.corridors?.some((corridor) =>
    distanceToDangerCorridor(point, corridor.from, corridor.to) <= corridor.width * scale
  ) ?? false;
}

export function fixedDangerAtPoint(
  regions: readonly WorldRegion[],
  point: WorldPoint,
  defaultDanger: 0 | 1 | 2 | 3 = 0
): 0 | 1 | 2 | 3 {
  let danger: 0 | 1 | 2 | 3 = defaultDanger;
  for (const region of regions) {
    if (pointInsideDangerRegion(region, point)) danger = region.dangerLevel;
  }
  return danger;
}

export function curatedZoneWaypoints(region: WorldRegion): readonly WorldPoint[] {
  if (!region.lobes?.length && !region.corridors?.length) {
    const radius = region.radius + 120;
    return Array.from({ length: 8 }, (_, index) => {
      const angle = Math.PI * 2 * index / 8;
      return {
        x: region.center.x + Math.cos(angle) * radius,
        y: region.center.y + Math.sin(angle) * radius,
      };
    });
  }
  if (region.dangerLevel === 3) {
    // Four tangent points near a small red pocket allow safe bypasses.
    return (region.lobes ?? []).slice(0, 2).flatMap((lobe) => [
      { x: lobe.center.x - lobe.radiusX * (region.scale ?? 1) - 85, y: lobe.center.y },
      { x: lobe.center.x + lobe.radiusX * (region.scale ?? 1) + 85, y: lobe.center.y },
      { x: lobe.center.x, y: lobe.center.y - lobe.radiusY * (region.scale ?? 1) - 85 },
      { x: lobe.center.x, y: lobe.center.y + lobe.radiusY * (region.scale ?? 1) + 85 },
    ]);
  }
  // Transit-room centers and corridor bends make actual yellow/green passage candidates.
  return [
    ...(region.lobes ?? []).map((lobe) => lobe.center),
    ...(region.corridors ?? []).map((corridor) => ({
      x: (corridor.from.x + corridor.to.x) / 2,
      y: (corridor.from.y + corridor.to.y) / 2,
    })),
  ];
}
