import type { PlayerEconomyState } from '../../core/economy-types';

export type TradeCharterId = 'independent' | 'veylan' | 'mercator';

export interface TradeCharterOffer {
  readonly id: TradeCharterId;
  readonly name: string;
  readonly joiningFee: number;
  readonly discount: number;
  readonly houseLevy: number;
  readonly protectedPirateFaction: 'pirates' | 'pirates2' | null;
}

export const TRADE_CHARTERS: readonly TradeCharterOffer[] = [
  {
    id: 'independent',
    name: 'Unabhängiges Handelsmandat',
    joiningFee: 35000,
    discount: 0,
    houseLevy: 0,
    protectedPirateFaction: null,
  },
  {
    id: 'veylan',
    name: 'Handelshaus Veylan',
    joiningFee: 85000,
    discount: 0.07,
    houseLevy: 0.03,
    protectedPirateFaction: 'pirates',
  },
  {
    id: 'mercator',
    name: 'Mercator-Kartell',
    joiningFee: 60000,
    discount: 0.04,
    houseLevy: 0.015,
    protectedPirateFaction: 'pirates2',
  },
];

export interface TradeCharterService {
  snapshot(): { active: TradeCharterId | null };
  readonly active: TradeCharterId | null;
  readonly offers: readonly TradeCharterOffer[];
  join(id: TradeCharterId): number | null;
  leave(): boolean;
  mayTrade(): boolean;
  saleFeeRate(logisticsFee: number): number;
  protectsPirate(factionId?: string): boolean;
}

export function createTradeCharterService(
  player: PlayerEconomyState,
  initial: TradeCharterId | null = 'independent'
): TradeCharterService {
  let active: TradeCharterId | null = initial;
  return {
    snapshot: () => ({ active }),
    offers: TRADE_CHARTERS,
    get active() {
      return active;
    },
    join(id) {
      if (active || !TRADE_CHARTERS.some((offer) => offer.id === id)) return null;
      const offer = TRADE_CHARTERS.find((candidate) => candidate.id === id)!;
      if (player.credits < offer.joiningFee) return null;
      player.credits -= offer.joiningFee;
      active = id;
      return offer.joiningFee;
    },
    leave() {
      if (!active) return false;
      active = null;
      return true;
    },
    mayTrade() {
      return active !== null;
    },
    saleFeeRate(logisticsFee) {
      const offer = TRADE_CHARTERS.find((candidate) => candidate.id === active);
      if (!offer) return Math.max(0, Math.min(0.95, logisticsFee));
      return Math.max(0, Math.min(0.95, logisticsFee - offer.discount + offer.houseLevy));
    },
    protectsPirate(factionId) {
      const offer = TRADE_CHARTERS.find((candidate) => candidate.id === active);
      return Boolean(factionId && offer?.protectedPirateFaction === factionId);
    },
  };
}
