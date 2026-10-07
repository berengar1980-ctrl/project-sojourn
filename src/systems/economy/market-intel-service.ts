import type { WorldPoint } from '../../core/world-types';
import {
  sensorMarketIntelAge,
  sensorMarketIntelBaseRange,
} from '../crew/crew-skill-effects';
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

export interface MarketIntelService {
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

export function createMarketIntelService(markets: EconomyMarketService): MarketIntelService {
  const intel = new Map<string, MarketIntelEntry>();
  const history = new Map<number, Map<string, readonly HistoricalMarketEntry[]>>();

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
        if (age <= 0) observeLocation(target.locationId, currentDay);
        else observeHistoricalLocation(target.locationId, Math.max(0, currentDay - age));
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
