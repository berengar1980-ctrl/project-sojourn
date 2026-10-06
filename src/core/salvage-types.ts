import type { EconomyResourceId } from './economy-types';
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
    | 'reactor'
    | 'engine'
    | 'shield'
    | 'hull'
    | 'sensor'
    | 'weapon'
    | 'cargo'
    | 'mining'
    | 'salvage';
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
