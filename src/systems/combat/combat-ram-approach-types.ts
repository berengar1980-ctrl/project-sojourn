/** Persistent geometric ram choice, independent of the opponent's tactic label. */
export interface RamApproachState {
  side: -1 | 1;
  phase: 'flank' | 'impact';
  flankDirection?: { x: number; y: number };
  intercept?: boolean;
  impactElapsedSeconds?: number;
  retryCooldownSeconds?: number;
}
