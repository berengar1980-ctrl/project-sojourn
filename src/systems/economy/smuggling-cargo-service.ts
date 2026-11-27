import { playerCargoFree, playerCargoUsed, visibleCargoQuantity } from '../../core/player-cargo';
import { piratePortFaction as pirateBase } from '../../core/pirate-ports';
import type { PlayerEconomyState } from '../../core/economy-types';
import { isIllegalResource } from '../../data/economy/economy-resources';
import {
  HIDDEN_CARGO_HOLD,
  HIDDEN_HOLD_INTEL_COST,
  HIDDEN_HOLD_INTEL_DAY,
  type SmugglingService,
  type SmugglingState,
} from './smuggling-types';

function cargoVisible(player: PlayerEconomyState, id: string): number {
  const lot = player.cargo[id];
  return lot ? visibleCargoQuantity(lot) : 0;
}

export function createSmugglingCargoService(
  player: PlayerEconomyState,
  state: SmugglingState
): Pick<
  SmugglingService,
  | 'activateShip'
  | 'hiddenCapacity'
  | 'normalPenalty'
  | 'hiddenUsed'
  | 'hiddenFree'
  | 'learnIntel'
  | 'install'
  | 'conceal'
  | 'reveal'
> {
  const installed = (shipId: string): boolean => Boolean(state.holds[shipId]);
  const hiddenUsed = (): number =>
    Object.values(player.cargo).reduce((total, lot) => total + (lot.hiddenQty ?? 0), 0);
  const hiddenCapacity = (shipId: string): number =>
    installed(shipId) ? HIDDEN_CARGO_HOLD.capacity : 0;
  const hiddenFree = (shipId: string): number => Math.max(0, hiddenCapacity(shipId) - hiddenUsed());

  return {
    activateShip(shipId) {
      player.smugglingNormalPenalty = installed(shipId) ? HIDDEN_CARGO_HOLD.normalCargoPenalty : 0;
    },
    hiddenCapacity,
    normalPenalty: (shipId) => (installed(shipId) ? HIDDEN_CARGO_HOLD.normalCargoPenalty : 0),
    hiddenUsed,
    hiddenFree,
    learnIntel(day) {
      if (state.hiddenHoldIntel) return true;
      if (day < HIDDEN_HOLD_INTEL_DAY || player.credits < HIDDEN_HOLD_INTEL_COST) return false;
      player.credits -= HIDDEN_HOLD_INTEL_COST;
      state.hiddenHoldIntel = true;
      state.hiddenHoldIntelContacted = true;
      return true;
    },
    install(shipId, locationId, normalCapacity) {
      if (!state.hiddenHoldIntel || installed(shipId) || !pirateBase(locationId)) return false;
      const normalUsed = playerCargoUsed(player);
      if (
        player.credits < HIDDEN_CARGO_HOLD.cost ||
        normalCapacity < HIDDEN_CARGO_HOLD.normalCargoPenalty ||
        normalUsed > normalCapacity - HIDDEN_CARGO_HOLD.normalCargoPenalty
      )
        return false;
      player.credits -= HIDDEN_CARGO_HOLD.cost;
      state.holds[shipId] = { shipId, installedAt: locationId };
      player.smugglingNormalPenalty = HIDDEN_CARGO_HOLD.normalCargoPenalty;
      return true;
    },
    conceal(resourceId, qty, shipId) {
      if (!installed(shipId) || !isIllegalResource(resourceId)) return 0;
      const lot = player.cargo[resourceId];
      if (!lot) return 0;
      const moved = Math.min(
        Math.max(0, Math.floor(qty)),
        cargoVisible(player, resourceId),
        hiddenFree(shipId)
      );
      if (moved > 0) lot.hiddenQty = (lot.hiddenQty ?? 0) + moved;
      return moved;
    },
    reveal(resourceId, qty, shipId, normalCapacity) {
      if (!installed(shipId)) return 0;
      const lot = player.cargo[resourceId];
      if (!lot) return 0;
      const moved = Math.min(
        Math.max(0, Math.floor(qty)),
        lot.hiddenQty ?? 0,
        playerCargoFree(player, normalCapacity, HIDDEN_CARGO_HOLD.normalCargoPenalty)
      );
      if (moved > 0) lot.hiddenQty = (lot.hiddenQty ?? 0) - moved;
      return moved;
    },
  };
}
