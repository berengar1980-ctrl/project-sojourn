import type { CombatVisualAsteroid } from './strategic-combat-types';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import type { FieldWitness } from './career-fleet-encounter';
import type { ParallelNativeDuels } from './parallel-native-duels';
import type { SectorNpcState } from '../../core/npc-types';
import type { BoardingOutcome } from '../../core/boarding-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldMap } from '../../core/world-types';
import type { NavigationService } from '../navigation';
import type { NpcSectorService } from '../npcs/npc-sector-service';
import type {
  StrategicCombatService,
  StrategicCombatantSetup,
  StrategicCombatArenaOptions,
  StrategicCombatSnapshot,
} from './strategic-combat-service';

export interface StarMapEngagementService {
  attackNpc(npcId: string): boolean;
  engageNpcNow(npcId: string): boolean;
  engageNpcInArena(
    npcId: string,
    arena: StrategicCombatArenaOptions,
    playerInitiated?: boolean
  ): boolean;
  engageNpcsInArena(
    attackerId: string,
    defenderId: string,
    arena: StrategicCombatArenaOptions
  ): boolean;
  syncPlayerPursuitTarget(): void;
  tick(deltaSeconds: number): void;
  activePlayerCombat(): StrategicCombatService | null;
  activePlayerFleet(): ParallelNativeDuels | null;
  escapedFieldShipIds(): ReadonlySet<string>;
  fieldCombat(
    locationId: string,
    seed: number,
    bystanders?: readonly StrategicCombatBystander[]
  ): StrategicCombatSnapshot | null;
  registerFieldCombatWreck(
    locationId: string,
    seed: number,
    destroyedId: string,
    body: CombatVisualAsteroid
  ): void;
  finishedFieldCombatSnapshots(): readonly StrategicCombatSnapshot[];
  activeNpcCombatSnapshots(): readonly StrategicCombatSnapshot[];
  activePlayerEnemy(): SectorNpcState | null;
  finishPlayerCombat(boardingOutcome?: BoardingOutcome): void;
  restorePlayerCareerCombat(combat: StrategicCombatService, enemyId: string): void;
}

export interface StarMapEngagementOptions {
  readonly fieldWitness?: FieldWitness;
  readonly inStarMap?: () => boolean;
  readonly fieldOwnsContact?: (npc: SectorNpcState) => boolean;
  readonly mayInitiateAttack?: (npc: SectorNpcState) => boolean;
  /** Restricts attacks on the player only; NPC battles remain independent. */
  readonly mayInterceptPlayer?: (npc: SectorNpcState) => boolean;
  readonly protectsNpc?: (attacker: SectorNpcState, defender: SectorNpcState) => boolean;
  readonly onPlayerAttack?: (npc: SectorNpcState) => void;
  readonly onPlayerVictory?: (id: string) => void;
  readonly onFieldFleetLosses?: (
    snapshot: StrategicCombatSnapshot,
    losses: readonly StrategicCombatSnapshot['attacker'][],
    locationId: string
  ) => void;
  readonly onNpcCombatEnded?: (
    snapshot: StrategicCombatSnapshot,
    attacker: SectorNpcState,
    defender: SectorNpcState
  ) => void;
  readonly navigation: NavigationService;
  readonly world?: () => WorldMap;
  readonly isPlayerInCampaignSystem?: () => boolean;
  readonly playerProtectedFromPirate?: (npc: SectorNpcState) => boolean;
  readonly sectorNpcs: NpcSectorService;
  readonly getPlayerShip: () => ShipDefinition;
  readonly getPlayerCombatant: () => StrategicCombatantSetup;
  readonly log: (message: string) => void;
}
