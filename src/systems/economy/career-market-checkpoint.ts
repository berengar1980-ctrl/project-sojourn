import type { EconomyResourceDefinition, EconomyResourceId } from '../../core/economy-types';
import type { PortDefinition } from '../../core/port-types';
import {
  createEconomyMarketService,
  type EconomyMarketService,
  type EconomyMarketServiceOptions,
} from './market-service';

export interface CareerMarketEntryCheckpoint {
  readonly resourceId: EconomyResourceId;
  readonly stock: number;
  readonly demand: number;
  readonly production: number;
  readonly price: number;
}

export interface CareerMarketCheckpoint {
  readonly version: 1;
  readonly markets: readonly {
    readonly locationId: string;
    readonly entries: readonly CareerMarketEntryCheckpoint[];
  }[];
}

/** Capture numeric market authority, not runtime Sets or references. */
export function captureCareerMarkets(service: EconomyMarketService): CareerMarketCheckpoint {
  return {
    version: 1,
    markets: service.snapshot().map((market) => ({
      locationId: market.locationId,
      entries: Object.values(market.entries).map((entry) => ({
        resourceId: entry.resourceId,
        stock: entry.stock,
        demand: entry.demand,
        production: entry.production,
        price: entry.price,
      })),
    })),
  };
}

function assertEntry(entry: CareerMarketEntryCheckpoint): void {
  if (
    !entry ||
    typeof entry.resourceId !== 'string' ||
    !Number.isSafeInteger(entry.stock) ||
    entry.stock < 0 ||
    !Number.isFinite(entry.demand) ||
    entry.demand < 0 ||
    entry.demand > 1 ||
    !Number.isFinite(entry.production) ||
    entry.production < 0 ||
    entry.production > 1 ||
    !Number.isSafeInteger(entry.price) ||
    entry.price < 1
  ) {
    throw new Error('Invalid career market entry');
  }
}

/**
 * Build a new market authority. The active service is never touched on failure.
 * Prices are restored as recorded: recalculation belongs to the next simulation tick.
 */
export function stageCareerMarkets(
  checkpoint: CareerMarketCheckpoint,
  ports: readonly PortDefinition[],
  resources: readonly EconomyResourceDefinition[],
  options: EconomyMarketServiceOptions = {}
): EconomyMarketService {
  if (!checkpoint || checkpoint.version !== 1 || !Array.isArray(checkpoint.markets)) {
    throw new Error('Unsupported career market checkpoint');
  }

  const service = createEconomyMarketService(ports, resources, options);
  const expected = service.snapshot();
  if (checkpoint.markets.length !== expected.length) {
    throw new Error('Career market location count mismatch');
  }

  const seenLocations = new Set<string>();
  for (const savedMarket of checkpoint.markets) {
    if (
      !savedMarket ||
      typeof savedMarket.locationId !== 'string' ||
      seenLocations.has(savedMarket.locationId) ||
      !Array.isArray(savedMarket.entries)
    ) {
      throw new Error('Invalid career market location');
    }
    seenLocations.add(savedMarket.locationId);
    const market = service.getMarket(savedMarket.locationId);
    if (!market || savedMarket.entries.length !== Object.keys(market.entries).length) {
      throw new Error('Unknown or incomplete career market');
    }
    const seenResources = new Set<string>();
    for (const savedEntry of savedMarket.entries) {
      assertEntry(savedEntry);
      if (seenResources.has(savedEntry.resourceId)) {
        throw new Error('Duplicate career market resource');
      }
      seenResources.add(savedEntry.resourceId);
      const entry = service.getEntry(savedMarket.locationId, savedEntry.resourceId);
      if (!entry) throw new Error('Unknown career market resource');
      entry.stock = savedEntry.stock;
      entry.demand = savedEntry.demand;
      entry.production = savedEntry.production;
      entry.price = savedEntry.price;
    }
  }

  return service;
}
