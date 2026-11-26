import type { PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import { isIllegalResource } from '../../data/economy/economy-resources';
import { createSmugglingCargoService } from './smuggling-cargo-service';
import { createSmugglingCustomsService } from './smuggling-customs-service';

import {
  PIRATE_PROTECTION_RATE,
  type PirateFaction,
  type SmugglingState,
  type SmugglingService,
} from './smuggling-types';
export {
  HIDDEN_CARGO_HOLD,
  HIDDEN_HOLD_INTEL_COST,
  HIDDEN_HOLD_INTEL_DAY,
  PIRATE_PROTECTION_RATE,
} from './smuggling-types';
export type {
  PirateFaction,
  CustomsSource,
  CustomsAction,
  CustomsOutcome,
  HiddenCargoHold,
  CustomsInspection,
  SmugglingState,
  ContrabandDetection,
  SmugglingService,
} from './smuggling-types';

function pirateBase(locationId: string): PirateFaction | null {
  if (locationId === 'blackjaw-outpost') return 'pirates';
  if (locationId === 'gallows-anchor') return 'pirates2';
  return null;
}

export function createSmugglingService(
  player: PlayerEconomyState,
  sectorNpcs: readonly SectorNpcState[] = [],
  recordLoss: (resourceId: string, amount: number) => void = () => {}
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
    decide(action, shipId, normalCapacity, rng) {
      const before = Object.entries(player.cargo).map(([id, lot]) => [id, lot.qty] as const);
      const result = customs.decide(action, shipId, normalCapacity, rng);
      if (result?.outcome === 'seized') {
        for (const [id, amount] of before) {
          const lost = amount - (player.cargo[id]?.qty ?? 0);
          if (lost > 0) recordLoss(id, lost);
        }
      }
      return result;
    },
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
