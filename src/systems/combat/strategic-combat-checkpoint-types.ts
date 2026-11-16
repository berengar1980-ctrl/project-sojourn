import type { CareerJson } from '../persistence/career-save-contract';

/** Persisted combat authority, including random stream progress. */
export interface CareerStrategicCombatCheckpoint {
  readonly version: 1;
  readonly seed: number;
  readonly randomCalls: number;
  readonly attackerId: string;
  readonly defenderId: string;
  /** Authoritative physics and cooldowns, not the renderer's visual snapshot. */
  readonly runtime: Readonly<Record<string, CareerJson>>;
}

/** Shared subsystem health contract, independent of the combat service. */
export interface CombatSubsystemHealth {
  readonly engine: number;
  readonly tractor: number;
  readonly maximum: number;
}
