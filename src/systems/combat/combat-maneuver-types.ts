import type { WorldPoint as CombatPoint } from '../../core/world-types';

export type CombatManeuverKind = 'intercept' | 'hold' | 'pass' | 'extend' | 'escape';

/** Transient encounter state, owned by the maneuver director, never by the HUD. */
export interface CombatManeuver {
  kind: CombatManeuverKind;
  planKey: string;
  reason: string;
  serial: number;
  recoveries: number;
  recovery: boolean;
  startedAt: number;
  lastProgressAt: number;
  bestError: number;
  bestAngle: number;
  lastShotAt: number;
  /** Passage/recovery endpoint is committed in world space, not chased every frame. */
  goal?: CombatPoint;
}

export interface CombatFlightObservation {
  readonly heading: number;
  readonly velocity: CombatPoint;
  readonly constraint: 'none' | 'navigation' | 'collision' | 'mine' | 'boundary' | 'ram';
}
