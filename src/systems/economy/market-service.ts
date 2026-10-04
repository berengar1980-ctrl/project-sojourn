import type {
  EconomyMarketEntry,
  EconomyMarketState,
  EconomyResourceDefinition,
  EconomyResourceId,
} from '../../core/economy-types';
import type { PortDefinition } from '../../core/port-types';

const MIN_PRICE_FACTOR = 0.28;
const MAX_PRICE_FACTOR = 3.2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function marketTargetPrice(
  resource: EconomyResourceDefinition,
  entry: Pick<EconomyMarketEntry, 'stock' | 'demand' | 'production'>,
  produces: boolean,
  needs: boolean
): number {
  const demand = clamp(entry.demand, 0, 1);
  const production = clamp(entry.production, 0, 1);
  const desiredStock = 900 + demand * 5200;
  const scarcity = clamp((desiredStock - finiteQuantity(entry.stock)) / desiredStock, -0.7, 1.5);
  const demandPressure = (demand - 0.5) * 0.62;
  const productionPressure = production * -0.34;
  const rolePressure = (needs ? 0.18 : 0) + (produces ? -0.16 : 0);
  const legalityPressure =
    resource.legality === 'illegal' ? 0.34 : resource.legality === 'restricted' ? 0.08 : 0;
  const factor = clamp(
    1 + scarcity * 0.58 + demandPressure + productionPressure + rolePressure + legalityPressure,
    MIN_PRICE_FACTOR,
    MAX_PRICE_FACTOR
  );
  return Math.max(1, Math.round(resource.basePrice * factor));
}

export interface EconomyMarketService {
  getMarket(locationId: string): EconomyMarketState | null;
  getEntry(locationId: string, resourceId: EconomyResourceId): EconomyMarketEntry | null;
  recalculate(locationId: string, resourceId: EconomyResourceId): number | null;
  snapshot(): readonly EconomyMarketState[];
}

export function createEconomyMarketService(
  ports: readonly PortDefinition[],
  resources: readonly EconomyResourceDefinition[]
): EconomyMarketService {
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
  const markets = new Map<string, EconomyMarketState>();

  for (const port of ports) {
    const entries: Record<EconomyResourceId, EconomyMarketEntry> = {};
    const produces = new Set(port.producedCommodityIds);
    const needs = new Set(port.neededCommodityIds);

    for (const commodity of port.commodities) {
      const resource = resourceMap.get(commodity.id);
      if (!resource) throw new Error(`Unknown economy resource: ${commodity.id}`);

      const entry: EconomyMarketEntry = {
        resourceId: commodity.id,
        stock: finiteQuantity(commodity.stock),
        demand: clamp(commodity.demand, 0, 1),
        production: clamp(commodity.production, 0, 1),
        price: resource.basePrice,
      };
      entry.price = marketTargetPrice(
        resource,
        entry,
        produces.has(commodity.id),
        needs.has(commodity.id)
      );
      entries[commodity.id] = entry;
    }

    markets.set(port.locationId, {
      locationId: port.locationId,
      produces,
      needs,
      entries,
    });
  }

  return {
    getMarket(locationId) {
      return markets.get(locationId) ?? null;
    },
    getEntry(locationId, resourceId) {
      return markets.get(locationId)?.entries[resourceId] ?? null;
    },
    recalculate(locationId, resourceId) {
      const market = markets.get(locationId);
      const entry = market?.entries[resourceId];
      const resource = resourceMap.get(resourceId);
      if (!market || !entry || !resource) return null;

      entry.price = marketTargetPrice(
        resource,
        entry,
        market.produces.has(resourceId),
        market.needs.has(resourceId)
      );
      return entry.price;
    },
    snapshot() {
      return [...markets.values()];
    },
  };
}
