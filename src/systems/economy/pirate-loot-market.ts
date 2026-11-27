import { pirateHomePort } from '../../core/pirate-ports';
import { applyMarketSale, wholeQuantity } from '../../core/economy-quantity';
import type { SectorNpcState } from '../../core/npc-types';
import type { EconomyMarketService } from './market-service';

export interface PirateLootSale {
  readonly units: number;
  readonly revenue: number;
}

/** Sell existing cargo at the pirate's home port. No new resources or raid rewards. */
export function sellPirateLootAtHome(
  npc: SectorNpcState,
  markets: EconomyMarketService
): PirateLootSale {
  const homeId = pirateHomePort(npc.factionId);
  if (!npc.pirate || npc.locationId !== homeId) return { units: 0, revenue: 0 };
  let units = 0;
  let revenue = 0;
  for (const [resourceId, aboard] of Object.entries(npc.cargo)) {
    const quantity = wholeQuantity(aboard);
    if (quantity === 0) continue;
    const entry = markets.getEntry(homeId, resourceId);
    if (!entry || !Number.isFinite(entry.price) || entry.price <= 0) continue;
    const proceeds = Math.max(1, Math.floor(entry.price * 0.65)) * quantity;
    applyMarketSale(entry, quantity);
    npc.credits += proceeds;
    units += quantity;
    revenue += proceeds;
    const left = aboard - quantity;
    if (left > 0) npc.cargo[resourceId] = left;
    else delete npc.cargo[resourceId];
    markets.recalculate(homeId, resourceId);
  }
  if (units > 0) {
    npc.pirateLootRevenue = (npc.pirateLootRevenue ?? 0) + revenue;
    npc.pirateLootUnitsSold = (npc.pirateLootUnitsSold ?? 0) + units;
    npc.activityId = 'loot-sale';
    npc.activity = 'Beute verwertet · +' + revenue + ' Credits';
  }
  return { units, revenue };
}
