import type { CombatImpactSnapshot } from '../../systems/combat/strategic-combat-service';
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface AutocannonVisualBurst {
  readonly origin: Point;
  readonly target: Point;
  readonly spawnedAt: number;
  readonly flightSeconds: number;
}
export interface VisibleCombatImpact {
  readonly impact: CombatImpactSnapshot;
  readonly startedAt: number;
}
