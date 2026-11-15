import type { WorldPoint } from '../../core/world-types';
import { sensorMarketIntelAge, sensorMarketIntelBaseRange } from '../crew/crew-skill-effects';
import type { EconomyMarketService } from './market-service';

const MARKET_HISTORY_DAYS = 12;
const SECTOR_UNITS_PER_VOIDBOUND_AU = 100;

export interface MarketIntelEntry {
  readonly locationId: string;
  readonly resourceId: string;
  readonly price: number;
  readonly stock: number;
  readonly observedDay: number;
}

export interface SensorMarketTarget {
  readonly locationId: string;
  readonly position: WorldPoint;
}

interface HistoricalMarketEntry {
  readonly resourceId: string;
  readonly price: number;
  readonly stock: number;
}

export interface CareerMarketIntelCheckpoint {
  readonly version: 1;
  readonly intel: readonly MarketIntelEntry[];
  readonly history: readonly {
    readonly day: number;
    readonly locations: readonly {
      readonly locationId: string;
      readonly entries: readonly HistoricalMarketEntry[];
    }[];
  }[];
}

export interface MarketIntelService {
  exportState(): CareerMarketIntelCheckpoint;
  recordHistory(day: number): void;
  observeAll(day: number): void;
  observeLocation(locationId: string, day: number): void;
  observeFromSensors(
    targets: readonly SensorMarketTarget[],
    origin: WorldPoint,
    day: number,
    sensorSkill: number,
    sensorModifier?: number
  ): void;
  entries(): readonly MarketIntelEntry[];
  entry(locationId: string, resourceId: string): MarketIntelEntry | null;
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function createMarketIntelService(
  markets: EconomyMarketService,
  checkpoint?: CareerMarketIntelCheckpoint
): MarketIntelService {
  const intel = new Map<string, MarketIntelEntry>();
  const history = new Map<number, Map<string, readonly HistoricalMarketEntry[]>>();

  if (checkpoint) {
    if (
      checkpoint.version !== 1 ||
      !Array.isArray(checkpoint.intel) ||
      !Array.isArray(checkpoint.history) ||
      checkpoint.history.length > MARKET_HISTORY_DAYS
    ) throw new Error('Invalid market intel checkpoint');
    const validLocations = new Set(markets.snapshot().map((market) => market.locationId));
    const validResources = new Set(
      markets.snapshot().flatMap((market) => Object.keys(market.entries))
    );
    const assertEntry = (entry: HistoricalMarketEntry): void => {
      if (!entry || !validResources.has(entry.resourceId) ||
          !Number.isSafeInteger(entry.price) || entry.price < 1 ||
          !Number.isSafeInteger(entry.stock) || entry.stock < 0) {
        throw new Error('Invalid market intel entry');
      }
    };
    for (const entry of checkpoint.intel) {
      if (!entry || !validLocations.has(entry.locationId) ||
          !Number.isSafeInteger(entry.observedDay) || entry.observedDay < 0) {
        throw new Error('Invalid market intel observation');
      }
      assertEntry(entry);
      const key = entry.locationId + '|' + entry.resourceId;
      if (intel.has(key)) throw new Error('Duplicate market intel observation');
      intel.set(key, { ...entry });
    }
    for (const savedDay of checkpoint.history) {
      if (!savedDay || !Number.isSafeInteger(savedDay.day) || savedDay.day < 0 ||
          !Array.isArray(savedDay.locations) || history.has(savedDay.day)) {
        throw new Error('Invalid market intel history day');
      }
      const locations = new Map<string, readonly HistoricalMarketEntry[]>();
      for (const location of savedDay.locations) {
        if (!location || !validLocations.has(location.locationId) ||
            locations.has(location.locationId) || !Array.isArray(location.entries)) {
          throw new Error('Invalid market intel history location');
        }
        const resourceIds = new Set<string>();
        for (const entry of location.entries) {
          assertEntry(entry);
          if (resourceIds.has(entry.resourceId)) throw new Error('Duplicate historical resource');
          resourceIds.add(entry.resourceId);
        }
        locations.set(location.locationId, location.entries.map((entry) => ({ ...entry })));
      }
      history.set(savedDay.day, locations);
    }
  }

  const writeEntries = (
    locationId: string,
    observedDay: number,
    entries: readonly HistoricalMarketEntry[]
  ): void => {
    for (const entry of entries) {
      const key = locationId + '|' + entry.resourceId;
      const current = intel.get(key);
      if (current && current.observedDay > observedDay) continue;
      intel.set(key, {
        locationId,
        resourceId: entry.resourceId,
        price: Math.max(1, Math.round(entry.price)),
        stock: Math.max(0, Math.round(entry.stock)),
        observedDay,
      });
    }
  };

  const liveEntries = (locationId: string): readonly HistoricalMarketEntry[] => {
    const market = markets.getMarket(locationId);
    if (!market) return [];
    return Object.values(market.entries).map((entry) => ({
      resourceId: entry.resourceId,
      price: entry.price,
      stock: entry.stock,
    }));
  };

  const recordHistory = (day: number): void => {
    const resolvedDay = Math.max(0, Math.floor(day));
    if (history.has(resolvedDay)) return;
    const snapshot = new Map<string, readonly HistoricalMarketEntry[]>();
    for (const market of markets.snapshot()) {
      snapshot.set(
        market.locationId,
        Object.values(market.entries).map((entry) => ({
          resourceId: entry.resourceId,
          price: entry.price,
          stock: entry.stock,
        }))
      );
    }
    history.set(resolvedDay, snapshot);
    for (const historyDay of [...history.keys()]) {
      if (historyDay < resolvedDay - MARKET_HISTORY_DAYS + 1) history.delete(historyDay);
    }
  };

  const observeLocation = (locationId: string, day: number): void => {
    const observedDay = Math.max(0, Math.floor(day));
    writeEntries(locationId, observedDay, liveEntries(locationId));
  };

  const observeHistoricalLocation = (locationId: string, observedDay: number): void => {
    const entries = history.get(observedDay)?.get(locationId);
    if (!entries) return;
    writeEntries(locationId, observedDay, entries);
  };

  return {
    exportState() {
      return {
        version: 1,
        intel: [...intel.values()].map((entry) => ({ ...entry })),
        history: [...history].map(([day, locations]) => ({
          day,
          locations: [...locations].map(([locationId, entries]) => ({
            locationId,
            entries: entries.map((entry) => ({ ...entry })),
          })),
        })),
      };
    },
    recordHistory,

    observeAll(day) {
      const observedDay = Math.max(0, Math.floor(day));
      for (const market of markets.snapshot()) observeLocation(market.locationId, observedDay);
    },

    observeLocation,

    observeFromSensors(targets, origin, day, sensorSkill, sensorModifier = 1) {
      const currentDay = Math.max(0, Math.floor(day));
      recordHistory(currentDay);
      const modifier = Math.max(0, sensorModifier);
      const rangeAu = sensorMarketIntelBaseRange(sensorSkill) * modifier;
      const rangeWorld = rangeAu * SECTOR_UNITS_PER_VOIDBOUND_AU;
      if (rangeWorld <= 0) return;

      for (const target of targets) {
        const targetDistance = distance(origin, target.position);
        if (targetDistance > rangeWorld) continue;
        const distanceAu = targetDistance / SECTOR_UNITS_PER_VOIDBOUND_AU;
        const age = sensorMarketIntelAge(sensorSkill, distanceAu, rangeAu);
        if (age <= 0) {
          observeLocation(target.locationId, currentDay);
          continue;
        }
        const observedDay = currentDay - age;
        if (observedDay < 0) continue;
        observeHistoricalLocation(target.locationId, observedDay);
      }
    },

    entries() {
      return [...intel.values()];
    },

    entry(locationId, resourceId) {
      return intel.get(locationId + '|' + resourceId) ?? null;
    },
  };
}
