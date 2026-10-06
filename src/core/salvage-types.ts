import type { EconomyResourceId } from './economy-types';
import type { LocalShipState } from './local-space-types';
import type { ShipComponentType } from './ship-types';
import type { WorldPoint } from './world-types';

export type SalvageWreckKind = 'freighter' | 'miner' | 'salvager' | 'patrol';
export type SalvageWreckQuality = 1 | 2 | 3;

export interface SalvageResourceDeposit {
  readonly resourceId: EconomyResourceId;
  readonly initialAmount: number;
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
  readonly position: WorldPoint;
  readonly radius: number;
  readonly rotation: number;
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

export type SalvageLocalPhase =
  | 'idle'
  | 'navigating'
  | 'approaching'
  | 'inspecting'
  | 'stripping'
  | 'extracting-component';

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
  readonly salvageAvailable: boolean;
  readonly cargoCapacityTons: number;
}
