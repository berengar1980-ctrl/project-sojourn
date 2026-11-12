import type { EconomyResourceId } from '../../core/economy-types';

export const HIDDEN_CARGO_HOLD = {
  id: 'concealed_cargo_hold',
  name: 'Verdeckter Frachtraum',
  capacity: 24,
  normalCargoPenalty: 12,
  concealment: 0.68,
  cost: 750000,
} as const;
export const HIDDEN_HOLD_INTEL_COST = 300000;
export const HIDDEN_HOLD_INTEL_DAY = 21;
export const PIRATE_PROTECTION_RATE = 0.05;
export type PirateFaction = 'pirates' | 'pirates2';
export type CustomsSource = 'harbor' | 'patrol';
export type CustomsAction = 'papers' | 'bribe' | 'comply' | 'flee' | 'fight' | 'ack';
export type CustomsOutcome = 'papers' | 'bribe' | 'clear' | 'seized' | 'escaped' | 'resisted';

export interface HiddenCargoHold {
  readonly shipId: string;
  readonly installedAt: string;
}
export interface CustomsInspection {
  readonly source: CustomsSource;
  readonly locationId: string;
  readonly patrolId?: string;
  readonly strength: number;
  stage: 'request' | 'result';
  papersTried: boolean;
  bribeTried: boolean;
  outcome?: CustomsOutcome;
  summary?: string;
}
export interface SmugglingState {
  hiddenHoldIntel: boolean;
  hiddenHoldIntelContacted: boolean;
  holds: Record<string, HiddenCargoHold>;
  suspicion: number;
  protectionFaction?: PirateFaction;
  totalProtectionFees: number;
  inspection: CustomsInspection | null;
}
export interface ContrabandDetection {
  readonly id: EconomyResourceId;
  readonly visibleQty: number;
  readonly hiddenQty: number;
  readonly qty: number;
}
export interface SmugglingService {
  readonly state: SmugglingState;
  activateShip(shipId: string): void;
  hiddenCapacity(shipId: string): number;
  normalPenalty(shipId: string): number;
  hiddenUsed(): number;
  hiddenFree(shipId: string): number;
  learnIntel(day: number): boolean;
  install(shipId: string, locationId: string, normalCapacity: number): boolean;
  conceal(resourceId: string, qty: number, shipId: string): number;
  reveal(resourceId: string, qty: number, shipId: string, normalCapacity: number): number;
  protect(faction: PirateFaction, locationId: string): boolean;
  protectionFee(resourceId: string, gross: number): number;
  recordSale(resourceId: string, gross: number): number;
  inspectionChance(
    source: CustomsSource,
    security: 'low' | 'medium' | 'high',
    shipId: string
  ): number;
  startInspection(
    source: CustomsSource,
    locationId: string,
    strength: number,
    patrolId?: string
  ): boolean;
  decide(
    action: CustomsAction,
    shipId: string,
    normalCapacity: number,
    rng?: () => number
  ): CustomsInspection | null;
  scan(strength: number, shipId: string, rng?: () => number): readonly ContrabandDetection[];
  bribeQuote(normalCapacity: number): number;
}
