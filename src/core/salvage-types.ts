import type { EconomyResourceId } from './economy-types';
import type { LocalShipState } from './local-space-types';
import type { WorldPoint } from './world-types';

export type SalvageWreckKind = 'freighter' | 'miner' | 'salvager' | 'patrol';
export type SalvageWreckQuality = 1 | 2 | 3;

export interface SalvageResourceDeposit {
  readonly resourceId: EconomyResourceId;
  readonly initialAmount: number;
  remainingAmount: number;
}

export interface SalvageComponentCandidate {
  readonly type:
    'reactor' | 'engine' | 'shield' | 'hull' | 'sensor' | 'weapon' | 'cargo' | 'mining' | 'salvage';
  readonly componentId: string;
  readonly recoveryDifficulty: number;
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

export type SalvageLocalPhase = 'idle' | 'navigating' | 'approaching' | 'inspecting' | 'stripping';

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
  readonly salvageAvailable: boolean;
  readonly cargoCapacityTons: number;
}
