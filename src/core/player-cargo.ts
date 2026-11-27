import type { PlayerCargoLot, PlayerEconomyState } from './economy-types';
import { wholeQuantity } from './economy-quantity';

export function visibleCargoQuantity(lot: PlayerCargoLot): number {
  return Math.max(0, wholeQuantity(lot.qty) - wholeQuantity(lot.hiddenQty ?? 0));
}

/** Normal hold occupancy excludes concealed goods and includes reserved component space. */
export function playerCargoUsed(player: PlayerEconomyState): number {
  const cargo = Object.values(player.cargo).reduce(
    (sum, lot) => sum + visibleCargoQuantity(lot),
    0
  );
  return cargo + wholeQuantity(player.reservedCargoTons ?? 0);
}

export function playerCargoFree(
  player: PlayerEconomyState,
  capacity: number,
  penalty = player.smugglingNormalPenalty ?? 0
): number {
  return Math.max(0, wholeQuantity(capacity) - wholeQuantity(penalty) - playerCargoUsed(player));
}

/** Ordinary removals consume visible goods first, then concealed goods. */
export function hiddenQuantityAfterRemoval(lot: PlayerCargoLot, quantity: number): number {
  return Math.max(0, (lot.hiddenQty ?? 0) - Math.max(0, quantity - visibleCargoQuantity(lot)));
}
