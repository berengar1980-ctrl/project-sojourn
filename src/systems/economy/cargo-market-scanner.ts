import type { PlayerEconomyState } from '../../core/economy-types';
import type { WorldPoint } from '../../core/world-types';
import { economyResourceById } from '../../data/economy/economy-resources';
import { sectorPortProfiles } from '../../data/ports/sector-port-profiles';
import { playerSaleUnitPrice } from './player-trade-service';
import type { MarketIntelService } from './market-intel-service';

export interface CargoSaleQuote {
  readonly locationId: string;
  readonly name: string;
  readonly revenue: number;
  readonly distance: number;
  readonly observedDay: number;
  readonly coveredQuantity: number;
  readonly totalQuantity: number;
}

export interface CargoResourceQuote {
  readonly resourceId: string;
  readonly name: string;
  readonly quantity: number;
  readonly best: CargoSaleQuote | null;
  readonly markets: readonly CargoSaleQuote[];
}

export interface CargoMarketHint {
  readonly locationId: string;
  readonly name: string;
  readonly distance: number;
  readonly matchedQuantity: number;
  readonly resourceIds: readonly string[];
}

export interface CargoMarketScanner {
  readonly hints: readonly CargoMarketHint[];
  readonly resources: readonly CargoResourceQuote[];
  readonly markets: readonly CargoSaleQuote[];
  readonly currentDay: number;
}

function marketBuyerHints(
  locations: readonly {
    readonly id: string;
    readonly name: string;
    readonly position: WorldPoint;
    readonly activities: { readonly trade?: boolean };
  }[],
  cargo: readonly { readonly resourceId: string; readonly quantity: number }[],
  origin: WorldPoint
): CargoMarketHint[] {
  const hints = locations
    .filter((location) => location.activities.trade)
    .flatMap((location) => {
      const profile = sectorPortProfiles.find((port) => port.locationId === location.id);
      if (!profile) return [];
      const matched = cargo.filter((item) => profile.needs.includes(item.resourceId));
      const matchedQuantity = matched.reduce((sum, item) => sum + item.quantity, 0);
      if (matchedQuantity === 0) return [];
      return [
        {
          locationId: location.id,
          name: location.name,
          matchedQuantity,
          resourceIds: matched.map((item) => item.resourceId),
          distance: Math.hypot(
            location.position.x - origin.x,
            location.position.y - origin.y
          ),
        },
      ];
    })
    .sort((a, b) => b.matchedQuantity - a.matchedQuantity || a.distance - b.distance);
  return hints;
}

export function scanCargoMarkets(options: {
  player: PlayerEconomyState;
  intel: MarketIntelService;
  locations: readonly {
    readonly id: string;
    readonly name: string;
    readonly position: WorldPoint;
    readonly activities: { readonly trade?: boolean };
  }[];
  origin: WorldPoint;
  currentDay: number;
}): CargoMarketScanner {
  const cargo = Object.entries(options.player.cargo)
    .filter(([, lot]) => Number.isFinite(lot.qty) && lot.qty > 0)
    .map(([resourceId, lot]) => ({
      resourceId,
      name: economyResourceById(resourceId)?.name ?? resourceId,
      quantity: Math.floor(lot.qty),
    }));
  const totalQuantity = cargo.reduce((sum, item) => sum + item.quantity, 0);
  const markets = options.locations
    .filter((location) => location.activities.trade)
    .map((location): CargoSaleQuote => {
      let revenue = 0;
      let coveredQuantity = 0;
      let observedDay = options.currentDay;
      for (const item of cargo) {
        const entry = options.intel.entry(location.id, item.resourceId);
        if (!entry) continue;
        revenue += playerSaleUnitPrice(entry.price) * item.quantity;
        coveredQuantity += item.quantity;
        observedDay = Math.min(observedDay, entry.observedDay);
      }
      return {
        locationId: location.id,
        name: location.name,
        revenue,
        distance: Math.hypot(
          location.position.x - options.origin.x,
          location.position.y - options.origin.y
        ),
        observedDay,
        coveredQuantity,
        totalQuantity,
      };
    })
    .filter((quote) => quote.coveredQuantity > 0)
    .sort(
      (a, b) =>
        Number(b.coveredQuantity === b.totalQuantity) -
          Number(a.coveredQuantity === a.totalQuantity) ||
        b.revenue - a.revenue ||
        a.distance - b.distance
    );
  const resources = cargo.map((item): CargoResourceQuote => {
    const matches = options.locations
      .filter((location) => location.activities.trade)
      .flatMap((location) => {
        const entry = options.intel.entry(location.id, item.resourceId);
        if (!entry) return [];
        return [
          {
            locationId: location.id,
            name: location.name,
            revenue: playerSaleUnitPrice(entry.price) * item.quantity,
            distance: Math.hypot(
              location.position.x - options.origin.x,
              location.position.y - options.origin.y
            ),
            observedDay: entry.observedDay,
            coveredQuantity: item.quantity,
            totalQuantity: item.quantity,
          },
        ];
      })
      .sort((a, b) => b.revenue - a.revenue || a.distance - b.distance);
    return { ...item, best: matches[0] ?? null, markets: matches };
  });
  const hints = marketBuyerHints(options.locations, cargo, options.origin);
  return { resources, markets, hints, currentDay: options.currentDay };
}
