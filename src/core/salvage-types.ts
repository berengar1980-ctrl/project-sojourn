import type { EconomyResourceId } from './economy-types';
import type { LocalShipState } from './local-space-types';
import type { ShipComponentType } from './ship-types';
import type { WorldPoint } from './world-types';

export type SalvageWreckKind = 'freighter' | 'miner' | 'salvager' | 'patrol';
export type SalvageWreckQuality = 1 | 2 | 3;
export type SalvageContainerVariant = 'standard' | 'damaged' | 'tank';
export type SalvageSectionVariant =
  | 'corridor-complex'
  | 'double-deck'
  | 'engine-room'
  | 'cargo-bay'
  | 'crew-quarters'
  | 'bridge'
  | 'reactor-hall'
  | 'medbay';

export interface SalvageSection {
  readonly id: string;
  readonly variant: SalvageSectionVariant;
  position: WorldPoint;
  readonly radius: number;
  driftVelocity: WorldPoint;
  rotation3d: { x: number; y: number; z: number };
  readonly spin3d: Readonly<{ x: number; y: number; z: number }>;
  readonly effectSeed: number;
}

export type SalvageDebrisVariant =
  | 'corridor'
  | 'deck'
  | 'airlock'
  | 'truss'
  | 'engine'
  | 'reactor'
  | 'bulkhead'
  | 'habitation';

/** Non-lootable ship fragments; kept separate from recoverable container wrecks. */
export interface SalvageDebris {
  readonly id: string;
  readonly variant: SalvageDebrisVariant;
  position: WorldPoint;
  readonly radius: number;
  driftVelocity: WorldPoint;
  rotation3d: { x: number; y: number; z: number };
  readonly spin3d: Readonly<{ x: number; y: number; z: number }>;
  readonly effectSeed: number;
}

export interface SalvageResourceDeposit {
  readonly resourceId: EconomyResourceId;
  initialAmount: number;
  remainingAmount: number;
}

export interface SalvageComponentCandidate {
  readonly type: ShipComponentType;
  readonly componentId: string;
  readonly recoveryDifficulty: number;
  readonly cargoTons: number;
}

export interface SalvageWreck {
  readonly id: string;
  readonly name: string;
  readonly kind: SalvageWreckKind;
  readonly quality: SalvageWreckQuality;
  position: WorldPoint;
  readonly radius: number;
  rotation: number;
  /** Only ordinary salvage containers drift; distress ships keep their original physics. */
  readonly containerVariant?: SalvageContainerVariant;
  driftVelocity?: WorldPoint;
  rotation3d?: { x: number; y: number; z: number };
  readonly spin3d?: Readonly<{ x: number; y: number; z: number }>;
  readonly integrity: number;
  readonly resources: SalvageResourceDeposit[];
  readonly component: SalvageComponentCandidate | null;
  componentStatus: 'none' | 'available' | 'recovered' | 'destroyed';
  inspected: boolean;
}

export interface SalvageField {
  readonly id: string;
  readonly sourceLocationId: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly wrecks: SalvageWreck[];
  /** Optional for event maps and compatibility with older field snapshots. */
  readonly debris?: SalvageDebris[];
  /** Large explorable-looking sections, visually independent of the throwable scrap pieces. */
  readonly sections?: SalvageSection[];
}

export interface SalvageRecoveryResult {
  readonly wreckId: string;
  readonly resourceId: EconomyResourceId;
  readonly recovered: number;
  readonly remaining: number;
  readonly depleted: boolean;
}

export interface SalvageComponentRecoveryResult {
  readonly wreckId: string;
  readonly componentId: string;
  readonly outcome: 'recovered' | 'destroyed' | 'no_space';
  readonly chancePercent: number;
}

export type SalvageEventType =
  'unstable-frame' | 'residual-power' | 'sealed-compartment' | 'volatile-cargo' | 'data-core';

export type SalvageEventRisk = 'safe' | 'controlled' | 'risky' | 'high_risk';

export interface SalvageEventChoice {
  readonly id: string;
  readonly label: string;
  readonly risk: SalvageEventRisk;
  readonly riskLabel: string;
}

export interface SalvageEventState {
  readonly id: string;
  readonly wreckId: string;
  readonly type: SalvageEventType;
  readonly title: string;
  readonly description: string;
  readonly choices: readonly SalvageEventChoice[];
}

export interface SalvageEventResolution {
  readonly title: string;
  readonly resultText: string;
  readonly resourceLostTons: number;
  readonly resourceAddedTons: number;
  readonly bonusResourceId: EconomyResourceId | null;
  readonly componentDestroyed: boolean;
}

export type SalvageLocalPhase =
  'idle' | 'navigating' | 'approaching' | 'inspecting' | 'stripping' | 'extracting-component';

export interface SalvageLocalSpaceSnapshot {
  readonly field: SalvageField;
  readonly ship: LocalShipState;
  readonly selectedWreckId: string | null;
  readonly workTargetId: string | null;
  readonly navigationTarget: WorldPoint | null;
  readonly navigationRoute: readonly WorldPoint[];
  readonly phase: SalvageLocalPhase;
  readonly operationProgress: number | null;
  readonly activeResourceId: EconomyResourceId | null;
  readonly lastRecovery: SalvageRecoveryResult | null;
  readonly recoverySerial: number;
  readonly lastComponentRecovery: SalvageComponentRecoveryResult | null;
  readonly componentRecoverySerial: number;
  readonly componentRecoveryChances: Readonly<Record<string, number>>;
  readonly salvageEvent: SalvageEventState | null;
  readonly salvageEventRecoverySeconds: number;
  readonly lastEventResolution: SalvageEventResolution | null;
  readonly eventResolutionSerial: number;
  readonly salvageAvailable: boolean;
  readonly cargoCapacityTons: number;
}

export type SectorSalvageEventType = 'special-wreck' | 'distress-rescue';
export type DistressDamageType =
  | 'nav_bus'
  | 'drive_control'
  | 'power_grid'
  | 'main_drive'
  | 'coolant'
  | 'hull_breach'
  | 'total_loss';
export type DistressStage =
  'approach' | 'diagnosed' | 'tow_required' | 'towing' | 'salvage_rights' | 'resolved';

export interface SectorSalvageEvent {
  readonly id: string;
  readonly type: SectorSalvageEventType;
  readonly title: string;
  readonly description: string;
  readonly position: WorldPoint;
  readonly wreckKind: SalvageWreckKind;
  readonly fieldSeed: number;
  readonly createdDay: number;
  expiresDay: number;
  playerDeadlineDay: number;
  playerAccepted: boolean;
  resolved: boolean;
  claimedByNpcId: string | null;
  readonly specialComponent: boolean;
  distressDamage: DistressDamageType | null;
  distressStage: DistressStage | null;
  distressTrap: boolean;
  salvageRights: boolean;
  distressDamageName: string | null;
  distressSeverity: string | null;
  distressRequiredEngineering: number | null;
  distressRepairHours: number;
  distressCanRepair: boolean;
  distressTechSkill: number | null;
  distressRewardMin: number;
  distressRewardMax: number;
  distressDangerLevel: 0 | 1 | 2 | 3;
  distressTowDestinationId: string | null;
  distressPendingRewardCredits: number;
}

export interface DistressActionResult {
  readonly success: boolean;
  readonly text: string;
  readonly boardingRequired: boolean;
  readonly salvageRights: boolean;
  readonly rewardCredits: number;
  readonly towDestinationId: string | null;
  readonly workHours: number;
}
