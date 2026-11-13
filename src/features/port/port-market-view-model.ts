import type { ResourceLegality } from '../../core/economy-types';
import type { EconomyMarketState, PlayerEconomyState } from '../../core/economy-types';
import { economyResourceById, resourceLegalityLabel } from '../../data/economy/economy-resources';
import { playerSaleUnitPrice } from '../../systems/economy/player-trade-service';
export interface PortMarketRowView {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly legality: ResourceLegality;
  readonly legalityLabel: string;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly stock: number;
  readonly demandLabel: string;
  readonly productionLabel: string;
  readonly trend: 'up' | 'flat' | 'down';
  readonly pressurePercent: number;
  readonly owned: number;
}

export interface PortSystemMarketInput {
  readonly locationId: string;
  readonly locationName: string;
  readonly locationKind: string;
  readonly distance: number;
  readonly resourceId: string;
  readonly price: number | null;
  readonly stock: number | null;
  readonly observedDay: number | null;
  readonly expectation: 'cheap' | 'neutral' | 'expensive';
}

export interface PortSystemMarketRowView extends PortSystemMarketInput {
  readonly resourceName: string;
  readonly sellPrice: number | null;
  readonly ageDays: number | null;
  readonly intelStatus: 'unknown' | 'live' | 'recent' | 'aging' | 'stale';
  readonly profit: number | null;
}

export interface PortCargoSaleView {
  readonly resourceId: string;
  readonly name: string;
  readonly quantity: number;
  readonly averageCost: number;
  readonly localSellPrice: number;
  readonly localProfit: number;
  readonly rating: 'best' | 'good' | 'mid' | 'poor' | 'loss';
  readonly bestLocationId: string;
  readonly bestLocationName: string;
  readonly bestSellPrice: number;
  readonly bestProfit: number;
  readonly bestAgeDays: number;
  readonly bestDistance: number;
  readonly bestIsHere: boolean;
}

function demandLabel(value: number): string {
  if (value >= 0.9) return 'sehr hoch';
  if (value >= 0.72) return 'hoch';
  if (value >= 0.5) return 'mittel';
  return 'gering';
}

function productionLabel(value: number): string {
  if (value >= 0.85) return 'hoch';
  if (value >= 0.55) return 'mittel';
  if (value >= 0.2) return 'gering';
  return 'keine';
}

export function marketRows(
  market: EconomyMarketState,
  player: PlayerEconomyState,
  saleFeeRate: number
): readonly PortMarketRowView[] {
  return Object.values(market.entries)
    .map((entry) => {
      const resource = economyResourceById(entry.resourceId);
      if (!resource) throw new Error(`Unknown market resource: ${entry.resourceId}`);
      const referenceDelta = (entry.price - resource.basePrice) / resource.basePrice;
      const trend: PortMarketRowView['trend'] =
        referenceDelta > 0.06 ? 'up' : referenceDelta < -0.06 ? 'down' : 'flat';

      return {
        id: resource.id,
        name: resource.name,
        category: resource.category,
        legality: resource.legality,
        legalityLabel: resourceLegalityLabel(resource.id),
        buyPrice: entry.price,
        sellPrice: playerSaleUnitPrice(entry.price, saleFeeRate),
        stock: Math.round(entry.stock),
        demandLabel: demandLabel(entry.demand),
        productionLabel: productionLabel(entry.production),
        trend,
        pressurePercent: Math.round(referenceDelta * 100),
        owned: player.cargo[resource.id]?.qty ?? 0,
      };
    })
    .sort((first, second) => {
      const category = first.category.localeCompare(second.category);
      return category !== 0 ? category : first.name.localeCompare(second.name);
    });
}

function intelStatus(ageDays: number | null): PortSystemMarketRowView['intelStatus'] {
  if (ageDays === null) return 'unknown';
  if (ageDays <= 0) return 'live';
  if (ageDays <= 2) return 'recent';
  if (ageDays <= 5) return 'aging';
  return 'stale';
}

export function systemRows(
  input: readonly PortSystemMarketInput[],
  player: PlayerEconomyState,
  currentDay: number,
  saleFeeRate: number
): PortSystemMarketRowView[] {
  return input
    .map((entry) => {
      const lot = player.cargo[entry.resourceId];
      const sellPrice = entry.price === null ? null : playerSaleUnitPrice(entry.price, saleFeeRate);
      const revenue = lot && sellPrice !== null ? sellPrice * lot.qty : 0;
      const profit = lot && sellPrice !== null ? Math.round(revenue - lot.totalCost) : null;
      const ageDays =
        entry.observedDay === null ? null : Math.max(0, currentDay - entry.observedDay);
      return {
        ...entry,
        resourceName: economyResourceById(entry.resourceId)?.name ?? entry.resourceId,
        sellPrice,
        ageDays,
        intelStatus: intelStatus(ageDays),
        profit,
      };
    })
    .sort((a, b) => {
      const resource = a.resourceName.localeCompare(b.resourceName);
      if (resource !== 0) return resource;
      if (a.sellPrice === null && b.sellPrice !== null) return 1;
      if (a.sellPrice !== null && b.sellPrice === null) return -1;
      return (b.sellPrice ?? 0) - (a.sellPrice ?? 0);
    });
}

export function cargoSaleRows(
  market: readonly PortMarketRowView[],
  system: readonly PortSystemMarketRowView[],
  player: PlayerEconomyState,
  locationId: string
): PortCargoSaleView[] {
  return Object.entries(player.cargo)
    .filter(([, lot]) => lot.qty > 0)
    .map(([resourceId, lot]) => {
      const local = market.find((entry) => entry.id === resourceId);
      const localSellPrice = local?.sellPrice ?? 0;
      const localProfit = Math.round(localSellPrice * lot.qty - lot.totalCost);
      const candidates = system
        .flatMap((entry) => {
          if (
            entry.resourceId !== resourceId ||
            entry.sellPrice === null ||
            entry.ageDays === null
          ) {
            return [];
          }
          return [
            {
              ...entry,
              sellPrice: entry.sellPrice,
              ageDays: entry.ageDays,
              saleProfit: Math.round(entry.sellPrice * lot.qty - lot.totalCost),
            },
          ];
        })
        .sort((a, b) => b.saleProfit - a.saleProfit || a.ageDays - b.ageDays);
      const best = candidates[0] ?? {
        locationId,
        locationName: 'Unbekannt',
        sellPrice: localSellPrice,
        saleProfit: localProfit,
        ageDays: 0,
        distance: 0,
      };
      const span = Math.max(
        1,
        best.saleProfit - Math.min(...candidates.map((entry) => entry.saleProfit), localProfit)
      );
      const relative = (localProfit - (best.saleProfit - span)) / span;
      const rating: PortCargoSaleView['rating'] =
        localProfit < 0
          ? 'loss'
          : best.locationId === locationId
            ? 'best'
            : relative >= 0.75
              ? 'good'
              : relative >= 0.45
                ? 'mid'
                : 'poor';
      return {
        resourceId,
        name: economyResourceById(resourceId)?.name ?? resourceId,
        quantity: lot.qty,
        averageCost: lot.qty > 0 ? lot.totalCost / lot.qty : 0,
        localSellPrice,
        localProfit,
        rating,
        bestLocationId: best.locationId,
        bestLocationName: best.locationName,
        bestSellPrice: best.sellPrice,
        bestProfit: best.saleProfit,
        bestAgeDays: best.ageDays,
        bestDistance: best.distance,
        bestIsHere: best.locationId === locationId,
      };
    })
    .sort((a, b) => b.localProfit - a.localProfit);
}
