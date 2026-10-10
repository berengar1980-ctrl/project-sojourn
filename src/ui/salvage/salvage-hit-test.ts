interface HitArea {
  readonly id: string;
  readonly point: { readonly x: number; readonly y: number };
  readonly radius: number;
}

export function pickNearestHitArea(areas: readonly HitArea[], x: number, y: number): string | null {
  let best: HitArea | null = null;
  for (const area of areas) {
    if (Math.hypot(x - area.point.x, y - area.point.y) > area.radius) continue;
    if (!best || area.radius < best.radius) best = area;
  }
  return best?.id ?? null;
}
