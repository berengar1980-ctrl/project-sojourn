import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import type { CareerStrategicCombatCheckpoint } from './strategic-combat-checkpoint-types';
import type {
  CombatLogEntry,
  CombatTactic,
  CombatVisualAsteroid,
  StrategicCombatArenaOptions,
  StrategicCombatObstacle,
  StrategicCombatSide,
  StrategicCombatSnapshot,
  MutableCombatant,
} from './strategic-combat-types';

export interface StrategicCombatStatus {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly winner: StrategicCombatSnapshot['winner'];
  readonly outcomeReason: StrategicCombatSnapshot['outcomeReason'];
  readonly boardingInitiator: StrategicCombatSnapshot['boardingInitiator'];
}

export interface StrategicCombatService {
  exportCareerState(): CareerStrategicCombatCheckpoint;
  getSnapshot(): StrategicCombatSnapshot;
  getStatus(): StrategicCombatStatus;
  advance(
    deltaSeconds: number,
    claimRamImpact?: (firstId: string, secondId: string) => boolean
  ): void;
  getArena(): StrategicCombatArenaOptions;
  attachToFleet(obstacles: StrategicCombatObstacle[], asteroids: CombatVisualAsteroid[]): void;
  getCombatLog(): readonly CombatLogEntry[];
  tick(deltaSeconds: number): StrategicCombatSnapshot;
  setBystanders(ships: readonly StrategicCombatBystander[]): void;
  setTactic(side: StrategicCombatSide, tactic: CombatTactic): void;
  surrender(side: StrategicCombatSide): void;
  fireGrapple(side: StrategicCombatSide): boolean;
  resumeAfterBoarding(): boolean;
  getParallelActor?(side: StrategicCombatSide): MutableCombatant;
  retargetParallelSurvivor?(
    side: StrategicCombatSide,
    opponent: MutableCombatant,
    orphaned?: boolean
  ): boolean;
  redirectParallelSupport?(opponent: MutableCombatant): boolean;
}
