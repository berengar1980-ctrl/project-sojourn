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

type MarketHistory = Map<number, Map<string, readonly HistoricalMarketEntry[]>>;

function assertMarketEntry(
  entry: HistoricalMarketEntry,
  resourceIds: ReadonlySet<string>
): void {
  if (
    !entry ||
    !resourceIds.has(entry.resourceId) ||
    !Number.isSafeInteger(entry.price) ||
    entry.price < 1 ||
    !Number.isSafeInteger(entry.stock) ||
    entry.stock < 0
  ) {
    throw new Error('Invalid market intel entry');
  }
}

function stageMarketObservations(
  checkpoint: CareerMarketIntelCheckpoint,
  locations: ReadonlySet<string>,
  resourceIds: ReadonlySet<string>
): Map<string, MarketIntelEntry> {
  const observations = new Map<string, MarketIntelEntry>();
  for (const entry of checkpoint.intel) {
    if (
      !entry ||
      !locations.has(entry.locationId) ||
      !Number.isSafeInteger(entry.observedDay) ||
      entry.observedDay < 0
    ) {
      throw new Error('Invalid market intel observation');
    }
    assertMarketEntry(entry, resourceIds);
    const key = entry.locationId + '|' + entry.resourceId;
    if (observations.has(key)) throw new Error('Duplicate market intel observation');
    observations.set(key, { ...entry });
  }
  return observations;
}

function stageHistoricalLocations(
  saved: CareerMarketIntelCheckpoint['history'][number]['locations'],
  locations: ReadonlySet<string>,
  resourceIds: ReadonlySet<string>
): Map<string, readonly HistoricalMarketEntry[]> {
  const result = new Map<string, readonly HistoricalMarketEntry[]>();
  for (const location of saved) {
    if (
      !location ||
      !locations.has(location.locationId) ||
      result.has(location.locationId) ||
      !Array.isArray(location.entries)
    ) {
      throw new Error('Invalid market intel history location');
    }
    const seen = new Set<string>();
    for (const entry of location.entries) {
      assertMarketEntry(entry, resourceIds);
      if (seen.has(entry.resourceId)) throw new Error('Duplicate historical resource');
      seen.add(entry.resourceId);
    }
    result.set(
      location.locationId,
      location.entries.map((entry) => ({ ...entry }))
    );
  }
  return result;
}

function stageMarketHistory(
  checkpoint: CareerMarketIntelCheckpoint,
  locations: ReadonlySet<string>,
  resourceIds: ReadonlySet<string>
): MarketHistory {
  const history: MarketHistory = new Map();
  for (const savedDay of checkpoint.history) {
    if (
      !savedDay ||
      !Number.isSafeInteger(savedDay.day) ||
      savedDay.day < 0 ||
      !Array.isArray(savedDay.locations) ||
      history.has(savedDay.day)
    ) {
      throw new Error('Invalid market intel history day');
    }
    history.set(
      savedDay.day,
      stageHistoricalLocations(savedDay.locations, locations, resourceIds)
    );
  }
  return history;
}

function stageMarketIntel(
  markets: EconomyMarketService,
  checkpoint: CareerMarketIntelCheckpoint
): { intel: Map<string, MarketIntelEntry>; history: MarketHistory } {
  if (
    checkpoint.version !== 1 ||
    !Array.isArray(checkpoint.intel) ||
    !Array.isArray(checkpoint.history) ||
    checkpoint.history.length > MARKET_HISTORY_DAYS
  ) {
    throw new Error('Invalid market intel checkpoint');
  }
  const snapshot = markets.snapshot();
  const locations = new Set(snapshot.map((market) => market.locationId));
  const resourceIds = new Set(snapshot.flatMap((market) => Object.keys(market.entries)));
  return {
    intel: stageMarketObservations(checkpoint, locations, resourceIds),
    history: stageMarketHistory(checkpoint, locations, resourceIds),
  };
}

function recordMarketHistory(
  history: MarketHistory,
  markets: EconomyMarketService,
  day: number
): void {
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


export function createMarketIntelService(
  markets: EconomyMarketService,
  checkpoint?: CareerMarketIntelCheckpoint
): MarketIntelService {
  const staged = checkpoint ? stageMarketIntel(markets, checkpoint) : null;
  const intel = staged?.intel ?? new Map<string, MarketIntelEntry>();
  const history: MarketHistory = staged?.history ?? new Map();

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

  const recordHistory = (day: number): void => recordMarketHistory(history, markets, day);

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
