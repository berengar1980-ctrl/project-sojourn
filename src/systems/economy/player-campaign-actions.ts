import { hiddenQuantityAfterRemoval, playerCargoFree } from '../../core/player-cargo';
import type {
  EconomyResourceId,
  PlayerCargoLot,
  PlayerEconomyState,
} from '../../core/economy-types';

/** Exact player-economy transactions. They never touch a market's stock or price. */
export interface PlayerCampaignEconomyActions {
  grantCredits(amount: number): boolean;
  takeCredits(amount: number): boolean;
  grantCargo(
    resourceId: EconomyResourceId,
    quantity: number,
    capacity: number,
    originId?: string
  ): boolean;
  removeCargo(resourceId: EconomyResourceId, quantity: number): boolean;
  snapshot(): PlayerEconomyState;
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function grantedCargoLot(
  lot: PlayerCargoLot | undefined,
  quantity: number,
  originId?: string
): PlayerCargoLot {
  const next: PlayerCargoLot = {
    qty: (lot?.qty ?? 0) + quantity,
    totalCost: lot?.totalCost ?? 0,
    ...(lot?.hiddenQty !== undefined ? { hiddenQty: lot.hiddenQty } : {}),
  };
  const source = originId ?? lot?.lastOriginId;
  if (source) next.lastOriginId = source;
  return next;
}

export function createPlayerCampaignEconomyActions(
  player: PlayerEconomyState,
  cargoUsed: () => number
): PlayerCampaignEconomyActions {
  return {
    grantCredits(amount) {
      if (!positiveSafeInteger(amount) || !Number.isSafeInteger(player.credits)) return false;
      if (player.credits > Number.MAX_SAFE_INTEGER - amount) return false;
      player.credits += amount;
      return true;
    },
    takeCredits(amount) {
      if (!positiveSafeInteger(amount) || !Number.isSafeInteger(player.credits)) return false;
      if (player.credits < amount) return false;
      player.credits -= amount;
      return true;
    },
    grantCargo(resourceId, quantity, capacity, originId) {
      if (!positiveSafeInteger(quantity) || !Number.isSafeInteger(capacity) || capacity < 0) {
        return false;
      }
      const used = cargoUsed();
      const lot = player.cargo[resourceId];
      if (!Number.isSafeInteger(used) || quantity > playerCargoFree(player, capacity)) return false;
      if (!Number.isSafeInteger(lot?.qty ?? 0)) return false;
      if ((lot?.qty ?? 0) > Number.MAX_SAFE_INTEGER - quantity) return false;
      player.cargo[resourceId] = grantedCargoLot(lot, quantity, originId);
      return true;
    },
    removeCargo(resourceId, quantity) {
      const lot = player.cargo[resourceId];
      if (!positiveSafeInteger(quantity) || !lot || !Number.isSafeInteger(lot.qty)) {
        return false;
      }
      if (lot.qty < quantity || !Number.isFinite(lot.totalCost) || lot.totalCost < 0) return false;
      if (lot.qty === quantity) {
        delete player.cargo[resourceId];
        return true;
      }
      const ratio = (lot.qty - quantity) / lot.qty;
      player.cargo[resourceId] = {
        ...lot,
        qty: lot.qty - quantity,
        ...(lot.hiddenQty !== undefined
          ? { hiddenQty: hiddenQuantityAfterRemoval(lot, quantity) }
          : {}),
        totalCost: Math.max(0, lot.totalCost * ratio),
      };
      return true;
    },
    snapshot() {
      return {
        credits: player.credits,
        cargo: Object.fromEntries(
          Object.entries(player.cargo).map(([id, lot]) => [id, { ...lot }])
        ),
        ...(player.reservedCargoTons === undefined
          ? {}
          : { reservedCargoTons: player.reservedCargoTons }),
      };
    },
  };
}
