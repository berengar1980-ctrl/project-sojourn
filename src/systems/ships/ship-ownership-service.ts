import type { ShipDefinition } from '../../core/ship-types';
import type { CrewRosterService } from '../crew/crew-roster-service';
import { crewCapacity } from '../crew/crew-performance';
import type { PlayerTradeService } from '../economy/player-trade-service';
import { playerCargoUsed } from '../economy/player-trade-service';
import { canShipCarryResource } from './ship-cargo-policy';
import type { ShipLoadoutService } from './ship-loadout-service';
import { getShipDefinition } from './ship-registry';
import { resolveShipRuntimeSetup } from './ship-runtime';

export interface ShipOwnershipSnapshot {
  readonly ownedShipIds: readonly string[];
}

export interface ShipOwnershipService {
  owns(shipId: string): boolean;
  purchase(shipId: string): number | null;
  snapshot(): ShipOwnershipSnapshot;
}

/** Price is derived only from the canonical hull definition, never from UI data. */
export function shipPurchasePrice(ship: ShipDefinition): number {
  const price = Math.round(ship.nominalLengthMeters * 12000);
  return Number.isSafeInteger(price) && price > 0 ? price : 0;
}

/** One in-memory authority for purchased hulls. The developer ship switcher is separate. */
export function createShipOwnershipService(
  starterShipId: string,
  wallet: Pick<PlayerTradeService, 'takeCredits'>
): ShipOwnershipService {
  const owned = new Set<string>([starterShipId]);
  return {
    owns(shipId) {
      return owned.has(shipId);
    },
    purchase(shipId) {
      const ship = getShipDefinition(shipId);
      if (!ship || owned.has(shipId)) return null;
      const price = shipPurchasePrice(ship);
      if (price === 0 || !wallet.takeCredits(price)) return null;
      owned.add(shipId);
      return price;
    },
    snapshot() {
      return { ownedShipIds: [...owned].sort() };
    },
  };
}

export type ShipActivationBlock =
  | 'not-owned'
  | 'cargo-overflow'
  | 'cargo-incompatible'
  | 'crew-overflow'
  | null;

/** Read-only preflight: rejects impossible transfers without touching credits or cargo. */
export function shipActivationBlock(
  next: ShipDefinition,
  ownership: ShipOwnershipService,
  trade: PlayerTradeService,
  crew: CrewRosterService,
  loadouts: ShipLoadoutService
): ShipActivationBlock {
  if (!ownership.owns(next.id)) return 'not-owned';
  const capacity = resolveShipRuntimeSetup(next, { installed: loadouts.get(next) })
    .cargoCapacityTons;
  if (playerCargoUsed(trade.player) > capacity) return 'cargo-overflow';
  if (Object.entries(trade.player.cargo).some(
    ([resourceId, lot]) => lot.qty > 0 && !canShipCarryResource(next, resourceId)
  )) return 'cargo-incompatible';
  if (crew.list().length > crewCapacity(next)) return 'crew-overflow';
  return null;
}
