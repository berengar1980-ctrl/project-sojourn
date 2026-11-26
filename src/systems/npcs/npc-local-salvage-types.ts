import type { FieldRouteState, FieldRouteObstacle } from '../navigation/field-ship-routing';
import type { LocalShipState } from '../../core/local-space-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { SalvageField, SalvageWreck, SalvageEventResolution } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';

export type LocalNpcSalvagePhase =
  'entering' | 'approaching' | 'scanning' | 'salvaging' | 'exiting';

export interface LocalNpcSalvagerState {
  readonly npcId: string;
  readonly name: string;
  readonly shipId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  routeState?: FieldRouteState;
  phase: LocalNpcSalvagePhase;
  targetWreckId: string | null;
  salvageActive: boolean;
  scanProgress: number;
  workAccumulator: number;
  exitPoint: WorldPoint;
}

export interface NpcLocalSalvageService {
  readonly ships: readonly LocalNpcSalvagerState[];
  syncCombatPose(npcId: string, position: WorldPoint, headingRadians: number, speed: number): void;
  tick(deltaSeconds: number, combatantId?: string, skipPlayer?: boolean): void;
}

export interface NpcLocalSalvageOptions {
  readonly locationId: string;
  readonly field: SalvageField;
  readonly salvagers: readonly SectorNpcState[];
  readonly initialPosition?: (id: string) => WorldPoint | undefined;
  readonly initialWorkers?: readonly LocalNpcSalvagerState[];
  readonly onWreckEventResolved?: (
    wreck: SalvageWreck,
    result: SalvageEventResolution
  ) => SalvageEventResolution;
  /** Disable internal contacts when the shared world solves all physical ships once. */
  readonly resolveLocalCollisions?: boolean;
  readonly getTrafficObstacles?: (npcId: string) => readonly FieldRouteObstacle[];
  readonly recover: (
    npc: SectorNpcState,
    resourceId: string,
    requested: number,
    sourceId?: string
  ) => number;
  readonly depart: (npc: SectorNpcState) => boolean;
  readonly canWorkWreck?: (npc: SectorNpcState, wreck: SalvageWreck) => boolean;
  readonly registerWreck?: (npc: SectorNpcState, wreck: SalvageWreck) => boolean;
  readonly playerShip?: ShipDefinition | undefined;
  readonly getPlayerShipState?: () => LocalShipState | undefined;
  readonly onPlayerShieldContact?: (normal: WorldPoint, overlap: number) => void;
}

