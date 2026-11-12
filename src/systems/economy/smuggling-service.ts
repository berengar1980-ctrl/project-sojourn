import type { PlayerEconomyState, EconomyResourceId } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import { isIllegalResource } from '../../data/economy/economy-resources';
import { createSmugglingCargoService } from './smuggling-cargo-service';
import { createSmugglingCustomsService } from './smuggling-customs-service';

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
function pirateBase(locationId: string): PirateFaction | null {
  if (locationId === 'blackjaw-outpost') return 'pirates';
  if (locationId === 'gallows-anchor') return 'pirates2';
  return null;
}

export function createSmugglingService(
  player: PlayerEconomyState,
  sectorNpcs: readonly SectorNpcState[] = []
): SmugglingService {
  const state: SmugglingState = {
    hiddenHoldIntel: false,
    hiddenHoldIntelContacted: false,
    holds: {},
    suspicion: 0,
    totalProtectionFees: 0,
    inspection: null,
  };
  const adjustSuspicion = (delta: number): void => {
    state.suspicion = Math.max(0, Math.min(100, state.suspicion + delta));
  };
  const cargo = createSmugglingCargoService(player, state);
  const customs = createSmugglingCustomsService(
    player,
    state,
    cargo.hiddenCapacity,
    adjustSuspicion
  );
  return {
    state,
    ...cargo,
    ...customs,
    protect(faction, locationId) {
      if (pirateBase(locationId) !== faction) return false;
      state.protectionFaction = faction;
      return true;
    },
    protectionFee(resourceId, gross) {
      return state.protectionFaction && isIllegalResource(resourceId)
        ? Math.max(0, Math.round(gross * PIRATE_PROTECTION_RATE))
        : 0;
    },
    recordSale(resourceId, gross) {
      const fee =
        state.protectionFaction && isIllegalResource(resourceId)
          ? Math.max(0, Math.round(gross * PIRATE_PROTECTION_RATE))
          : 0;
      if (fee > 0) {
        player.credits -= fee;
        state.totalProtectionFees += fee;
        const fleet = sectorNpcs.filter(
          (npc) => npc.pirate && npc.factionId === state.protectionFaction
        );
        const payout = Math.round(fee * 0.65);
        const each = fleet.length ? Math.floor(payout / fleet.length) : 0;
        const extra = fleet.length ? payout - each * fleet.length : 0;
        fleet.forEach((npc, index) => {
          npc.credits += each + (index < extra ? 1 : 0);
        });
      }
      if (isIllegalResource(resourceId)) adjustSuspicion(2);
      return fee;
    },
  };
}
