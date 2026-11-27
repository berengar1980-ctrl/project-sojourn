import {
  hiddenQuantityAfterRemoval,
  playerCargoFree,
  playerCargoUsed,
} from '../../core/player-cargo';
import {
  applyMarketPurchase,
  applyMarketSale,
  wholeQuantity as finiteInteger,
} from '../../core/economy-quantity';
import type {
  EconomyResourceId,
  PlayerCargoLot,
  PlayerEconomyState,
  TradeResult,
} from '../../core/economy-types';
import type { EconomyMarketService } from './market-service';
import {
  createPlayerCampaignEconomyActions,
  type PlayerCampaignEconomyActions,
} from './player-campaign-actions';

// Without a working logistics station the vendor retains 25%; purchases pay no fee.
const DEFAULT_SALE_FEE_RATE = 0.25;

export function playerSaleUnitPrice(marketPrice: number, feeRate = DEFAULT_SALE_FEE_RATE): number {
  const price = Math.max(1, Number.isFinite(marketPrice) ? marketPrice : 1);
  const fee = Math.max(0, Math.min(1, Number.isFinite(feeRate) ? feeRate : DEFAULT_SALE_FEE_RATE));
  return Math.max(1, Math.round(price * (1 - fee)));
}

export { playerCargoUsed } from '../../core/player-cargo';

function weightedCostAfterPurchase(
  lot: PlayerCargoLot | undefined,
  quantity: number,
  cost: number
): number {
  return Math.max(0, (lot?.totalCost ?? 0) + quantity * cost);
}

export interface PlayerTradeService extends PlayerCampaignEconomyActions {
  readonly player: PlayerEconomyState;
  buy(
    locationId: string,
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    cargoCapacityTons: number
  ): TradeResult | null;
  sell(
    locationId: string,
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    saleFeeRate?: number
  ): TradeResult | null;
  receiveCargo(
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    cargoCapacityTons: number,
    originId?: string
  ): number;
}

export function createPlayerTradeService(
  markets: EconomyMarketService,
  initialCredits = 238450
): PlayerTradeService {
  const player: PlayerEconomyState = {
    credits: Math.max(0, Math.floor(initialCredits)),
    cargo: {},
  };

  return {
    player,
    ...createPlayerCampaignEconomyActions(player, () => playerCargoUsed(player)),

    buy(locationId, resourceId, requestedQuantity, cargoCapacityTons) {
      const entry = markets.getEntry(locationId, resourceId);
      if (!entry) return null;

      const requested = finiteInteger(requestedQuantity);
      const cargoFree = playerCargoFree(player, cargoCapacityTons);
      const affordable = Math.floor(player.credits / Math.max(1, entry.price));
      const quantity = Math.min(requested, finiteInteger(entry.stock), cargoFree, affordable);
      if (quantity <= 0) return null;

      const cost = quantity * entry.price;
      const lot = player.cargo[resourceId];
      player.credits -= cost;
      applyMarketPurchase(entry, quantity);
      player.cargo[resourceId] = {
        qty: (lot?.qty ?? 0) + quantity,
        totalCost: weightedCostAfterPurchase(lot, quantity, entry.price),
        lastOriginId: locationId,
        ...(lot?.hiddenQty ? { hiddenQty: lot.hiddenQty } : {}),
      };
      const unitPrice = entry.price;
      markets.recalculate(locationId, resourceId);

      return {
        resourceId,
        quantity,
        unitPrice,
        creditsDelta: -cost,
        realizedProfit: 0,
      };
    },

    receiveCargo(resourceId, requestedQuantity, cargoCapacityTons, originId) {
      const requested = finiteInteger(requestedQuantity);
      const cargoFree = playerCargoFree(player, cargoCapacityTons);
      const quantity = Math.min(requested, cargoFree);
      if (quantity <= 0) return 0;

      const lot = player.cargo[resourceId];
      const receivedLot: PlayerCargoLot = {
        qty: (lot?.qty ?? 0) + quantity,
        totalCost: Math.max(0, lot?.totalCost ?? 0),
      };
      if (lot?.hiddenQty) receivedLot.hiddenQty = lot.hiddenQty;
      const receivedOriginId = originId ?? lot?.lastOriginId;
      if (receivedOriginId) receivedLot.lastOriginId = receivedOriginId;
      player.cargo[resourceId] = receivedLot;
      return quantity;
    },

    sell(locationId, resourceId, requestedQuantity, saleFeeRate) {
      const entry = markets.getEntry(locationId, resourceId);
      const lot = player.cargo[resourceId];
      if (!entry || !lot) return null;

      const quantity = Math.min(finiteInteger(requestedQuantity), finiteInteger(lot.qty));
      if (quantity <= 0) return null;

      const unitPrice = playerSaleUnitPrice(entry.price, saleFeeRate);
      const averageCost = lot.qty > 0 ? lot.totalCost / lot.qty : 0;
      const revenue = quantity * unitPrice;
      const realizedProfit = Math.round(revenue - averageCost * quantity);

      player.credits += revenue;
      applyMarketSale(entry, quantity);
      if (lot.hiddenQty !== undefined) lot.hiddenQty = hiddenQuantityAfterRemoval(lot, quantity);
      lot.qty -= quantity;
      lot.totalCost = Math.max(0, lot.totalCost - averageCost * quantity);
      if (lot.qty <= 0) delete player.cargo[resourceId];

      markets.recalculate(locationId, resourceId);
      return {
        resourceId,
        quantity,
        unitPrice,
        creditsDelta: revenue,
        realizedProfit,
      };
    },
  };
}
