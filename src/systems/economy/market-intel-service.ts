import type { EconomyMarketService } from './market-service';

export interface MarketIntelEntry {
  readonly locationId: string;
  readonly resourceId: string;
  readonly price: number;
  readonly stock: number;
  readonly observedDay: number;
}

export interface MarketIntelService {
  observeAll(day: number): void;
  observeLocation(locationId: string, day: number): void;
  entries(): readonly MarketIntelEntry[];
  entry(locationId: string, resourceId: string): MarketIntelEntry | null;
}

export function createMarketIntelService(markets: EconomyMarketService): MarketIntelService {
  const intel = new Map<string, MarketIntelEntry>();

  const observeLocation = (locationId: string, day: number): void => {
    const market = markets.getMarket(locationId);
    if (!market) return;
    const observedDay = Math.max(0, Math.floor(day));
    for (const entry of Object.values(market.entries)) {
      intel.set(locationId + '|' + entry.resourceId, {
        locationId,
        resourceId: entry.resourceId,
        price: Math.max(1, Math.round(entry.price)),
        stock: Math.max(0, Math.round(entry.stock)),
        observedDay,
      });
    }
  };

  return {
    observeAll(day) {
      for (const market of markets.snapshot()) observeLocation(market.locationId, day);
    },
    observeLocation,
    entries() {
      return [...intel.values()];
    },
    entry(locationId, resourceId) {
      return intel.get(locationId + '|' + resourceId) ?? null;
    },
  };
}
