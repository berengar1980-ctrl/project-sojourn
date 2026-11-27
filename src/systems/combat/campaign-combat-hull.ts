/** Preserve the exact alive/dead boundary when publishing integral career hull HP. */
export function campaignHullPoints(hullHp: number, maximum: number): number {
  if (hullHp <= 0) return 0;
  return Math.max(1, Math.min(maximum, Math.round(hullHp)));
}
