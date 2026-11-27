import type {
  NpcCombatMovementMode,
  NpcCombatTargetKind,
  SectorNpcState,
} from '../../core/npc-types';

import type { WorldPoint } from '../../core/world-types';
import type { EconomyMarketService } from '../economy/market-service';
import type { NpcTravelOperatingQuote } from '../economy/npc-economy-types';
import type { NpcPopulationService } from './npc-population-service';

export interface NpcSectorServiceOptions {
  readonly getPlayerPosition?: () => WorldPoint;
  readonly markets?: EconomyMarketService;
  readonly population?: NpcPopulationService;
}

export interface NpcSectorService {
  readonly npcs: readonly SectorNpcState[];
  indexById?(): ReadonlyMap<string, SectorNpcState>;
  requestTravel(npc: SectorNpcState, destinationId: string, reason?: string): boolean;
  quoteTravel(
    npc: SectorNpcState,
    destinationId: string,
    availableCredits?: number
  ): NpcTravelOperatingQuote | null;
  requestPatrol(npc: SectorNpcState): boolean;
  startPursuit(
    npc: SectorNpcState,
    targetKind: NpcCombatTargetKind,
    targetId: string,
    targetPosition: WorldPoint,
    reason?: string
  ): boolean;
  startFlee(
    npc: SectorNpcState,
    targetKind: NpcCombatTargetKind,
    targetId: string,
    targetPosition: WorldPoint,
    reason?: string
  ): boolean;
  markEngaged(
    npc: SectorNpcState,
    targetKind: NpcCombatTargetKind,
    targetId: string,
    reason?: string
  ): void;
  recoverFromCombat(npc: SectorNpcState, reason?: string, remainInField?: boolean): boolean;
  combatMode(npc: SectorNpcState): NpcCombatMovementMode | null;
  isTravelling(npc: SectorNpcState): boolean;
  livePosition(npc: SectorNpcState): WorldPoint;
  liveHeading(npc: SectorNpcState): number;
  tick(deltaSeconds: number): void;
  advanceDay(day: number): void;
}
