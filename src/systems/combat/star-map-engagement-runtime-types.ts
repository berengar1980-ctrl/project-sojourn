import type { SectorNpcState } from '../../core/npc-types';
import type { StrategicCombatService } from './strategic-combat-service';
import type { StarMapEngagementOptions } from './star-map-engagement-contract';
import type { CareerFleetEncounter } from './career-fleet-encounter';

export interface ChaseRecord {
  readonly attackerId: string;
  readonly targetId: string;
  readonly initialDistance: number;
}

export interface BackgroundCombat {
  readonly first: SectorNpcState;
  readonly second: SectorNpcState;
  readonly combat: StrategicCombatService;
  readonly fleet: CareerFleetEncounter;
}

export interface EngagementRuntime {
  readonly options: StarMapEngagementOptions;
  playerChase: ChaseRecord | null;
  playerCombat: StrategicCombatService | null;
  playerFleet: CareerFleetEncounter | null;
  playerEnemy: SectorNpcState | null;
  piratePlayerChase: ChaseRecord | null;
  readonly npcChases: Map<string, ChaseRecord>;
  readonly backgroundCombats: Map<string, BackgroundCombat>;
  attackScanAccumulator: number;
}
