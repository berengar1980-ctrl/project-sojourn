import type { CombatPoint } from './strategic-combat-types';

export interface ShieldSegmentHit {
  readonly point: CombatPoint;
  readonly surfaceAnchor: CombatPoint;
  readonly t: number;
}
