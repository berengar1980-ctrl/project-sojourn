import type { ParallelNativeDuelSnapshot } from '../systems/combat/parallel-native-duels';
import type { SalvageNpcAttackArena } from './game-controller-salvage-attack';
import type { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { StrategicCombatBystander } from '../systems/combat/strategic-combat-bystander-types';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';
import type { SalvageField, SectorSalvageEvent } from '../core/salvage-types';
import type { PlayerEconomyState } from '../core/economy-types';
import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { GameAudioService } from '../systems/audio/game-audio-service';
import type { WorldLocation, WorldPoint } from '../core/world-types';
import type { SalvageEconomyService } from '../systems/economy/salvage-economy-service';
import type { NpcEconomyService } from '../systems/economy/npc-economy-service';
import type { SectorNpcState } from '../core/npc-types';
import type { ShipComponentInventoryService, ShipRuntimeOptions } from '../systems/ships';

export interface SalvageSceneController {
  body(id: string): { position: WorldPoint; headingRadians: number; speed: number } | undefined;
  attackNpc(id: string, playerInitiated?: boolean): void;
  getField(): SalvageField;
  beginDistressTow(event: SectorSalvageEvent): void;
  canAttachDistressTow(): boolean;
  updateSectorEvent(event: SectorSalvageEvent | null): void;
  beginDistressRepair(): void;
  tick(deltaSeconds: number): void;
  finishCombat(snapshot: StrategicCombatSnapshot): void;
  destroy(): void;
}

export interface SalvageSceneOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly seed: number;
  readonly location: WorldLocation;
  readonly economy: SalvageEconomyService;
  readonly npcEconomy: NpcEconomyService;
  readonly sectorNpcs: readonly SectorNpcState[];
  readonly wreckClaims: WreckClaimRegistry;
  readonly getCurrentDay: () => number;
  readonly player: PlayerEconomyState;
  readonly componentInventory: ShipComponentInventoryService;
  readonly runtimeOptions?: ShipRuntimeOptions;
  readonly log: SystemLogService;
  readonly audio: GameAudioService;
  readonly onReturnToStarMap: () => void;
  readonly selectedNpcId?: string | null;
  readonly onSelectNpc?: (id: string | null) => void;
  readonly onAttackNpc?: (
    id: string,
    arena: SalvageNpcAttackArena,
    playerInitiated?: boolean
  ) => void;
  readonly getFieldDuels?: () => readonly StrategicCombatSnapshot[];
  readonly escapedFieldShipIds?: () => ReadonlySet<string>;
  readonly getFleet?: () => ParallelNativeDuelSnapshot | null;
  readonly getCombat?: () => StrategicCombatSnapshot | null;
  readonly resolveDrone?: (field: SalvageField) => AsteroidSecurityDrone;
  readonly onUnauthorizedSalvage?: (field: SalvageField, wreckId: string) => void;
  readonly resolvePirateTraffic?: (field: SalvageField) => LocalPirateTraffic;
  readonly onFreighterExit?: (npc: SectorNpcState) => void;
  readonly getNpcCombats?: () => readonly StrategicCombatSnapshot[];
  readonly onPirateAttack?: (
    field: SalvageField,
    pirateId: string,
    targetId: string,
    piratePosition: WorldPoint,
    targetPosition: WorldPoint
  ) => boolean;
  readonly onDroneAttack?: (
    field: SalvageField,
    pirateId: string,
    piratePosition: WorldPoint,
    dronePosition: WorldPoint
  ) => boolean;
  readonly onCombatBystanders?: (
    field: SalvageField,
    bystanders: readonly StrategicCombatBystander[]
  ) => void;
  readonly field?: SalvageField;
  readonly onLeaveField?: (field: SalvageField) => void;
  readonly sectorEvent?: SectorSalvageEvent | null;
  readonly onDiagnoseDistress?: (eventId: string) => void;
  readonly onBoardWreck?: (wreckId: string) => void;
  readonly onRepairDistress?: (eventId: string) => void;
  readonly onTowDistress?: (eventId: string) => void;
  readonly onEvacuateDistress?: (eventId: string) => void;
  readonly onSectorEventResolved?: (eventId: string) => void;
  readonly isCombatActive?: () => boolean;
  readonly onCombatTactic?: (tactic: 'fight' | 'kite' | 'flee' | 'minefield') => void;
  readonly onCombatGrapple?: () => void;
}
