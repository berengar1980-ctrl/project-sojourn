export type EconomyResourceId = string;
export type EconomyLocationId = string;
export type ResourceLegality = 'legal' | 'restricted' | 'illegal';
export type ResourceCategoryId =
  'raw' | 'industry' | 'energy-chemistry' | 'supplies' | 'military-luxury' | 'contraband';

export interface EconomyResourceDefinition {
  readonly id: EconomyResourceId;
  readonly name: string;
  readonly categoryId: ResourceCategoryId;
  readonly category: string;
  readonly basePrice: number;
  readonly legality: ResourceLegality;
}

export interface EconomyMarketStock {
  readonly locationId: EconomyLocationId;
  readonly produces: ReadonlySet<EconomyResourceId>;
  readonly needs: ReadonlySet<EconomyResourceId>;
  readonly stock: Record<EconomyResourceId, number>;
}

export interface EconomyCargoHold {
  readonly cargo: Record<EconomyResourceId, number>;
}

export interface EconomyResourcePool {
  readonly target: number;
  reserve: number;
  externalImports: number;
  recordedLosses: number;
}

export interface ResourceCirculationState {
  readonly pools: Record<EconomyResourceId, EconomyResourcePool>;
  readonly markets: readonly EconomyMarketStock[];
  readonly player: EconomyCargoHold;
  readonly npcs: readonly EconomyCargoHold[];
}

export interface EconomyMarketEntry {
  readonly resourceId: EconomyResourceId;
  stock: number;
  demand: number;
  production: number;
  price: number;
}

export interface EconomyMarketState {
  readonly locationId: EconomyLocationId;
  readonly produces: ReadonlySet<EconomyResourceId>;
  readonly needs: ReadonlySet<EconomyResourceId>;
  readonly entries: Record<EconomyResourceId, EconomyMarketEntry>;
}

export interface PlayerCargoLot {
  qty: number;
  totalCost: number;
  lastOriginId?: EconomyLocationId;
  hiddenQty?: number;
}

export interface PlayerEconomyState {
  credits: number;
  readonly cargo: Record<EconomyResourceId, PlayerCargoLot>;
  reservedCargoTons?: number;
  smugglingNormalPenalty?: number;
}

export interface TradeResult {
  readonly resourceId: EconomyResourceId;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly creditsDelta: number;
  readonly realizedProfit: number;
}

export type NpcEconomyRole = 'freighter' | 'miner' | 'salvager' | 'patrol' | 'trader';

export type NpcAutonomyPhase =
  | 'docking'
  | 'unloading'
  | 'resting'
  | 'thinking'
  | 'loading'
  | 'launch-prep'
  | 'working'
  | 'patrol-rest'
  | 'ready'
  | 'travel';

export interface NpcPersonality {
  readonly riskTolerance: number;
  readonly patience: number;
  readonly profitDrive: number;
  readonly routineBias: number;
  preferredMarketId?: EconomyLocationId;
}

export interface NpcPendingTrade {
  readonly resourceId: EconomyResourceId;
  readonly destinationId: EconomyLocationId;
  readonly quantity: number;
  readonly reason: string;
}

export interface NpcAutonomyState {
  phase: NpcAutonomyPhase;
  secondsRemaining: number;
  lastLocationId: EconomyLocationId;
  wasTravelling: boolean;
  pendingDestinationId?: EconomyLocationId;
  pendingReason?: string;
  pendingTrade?: NpcPendingTrade;
  pendingSaleResourceId?: EconomyResourceId;
  lastTradeDestinationId?: EconomyLocationId;
}

export interface NpcMarketIntelEntry {
  readonly resourceId: EconomyResourceId;
  price: number;
  stock: number;
}

export interface NpcMarketIntelLocation {
  readonly locationId: EconomyLocationId;
  observedDay: number;
  readonly entries: Record<EconomyResourceId, NpcMarketIntelEntry>;
}

export interface NpcResourceSideTradePlan {
  readonly resourceId: EconomyResourceId;
  readonly sourceLocationId: EconomyLocationId;
  readonly tradeLocationId: EconomyLocationId;
  readonly workLocationId: EconomyLocationId;
  readonly quantity: number;
  readonly costBasis: number;
  readonly expectedProfit: number;
  readonly extraDistance: number;
  readonly allowedExtraDistance: number;
}

export interface NpcEconomyState {
  readonly id: string;
  readonly role: NpcEconomyRole;
  locationId: EconomyLocationId;
  credits: number;
  cargoCapacity: number;
  normalCargoCapacity?: number;
  readonly cargo: Record<EconomyResourceId, number>;
  readonly workResourceIds: readonly EconomyResourceId[];
  readonly workLocationId?: EconomyLocationId;
  readonly homePortId?: EconomyLocationId;
  marketIntel?: Record<EconomyLocationId, NpcMarketIntelLocation>;
  personality?: NpcPersonality;
  autonomy?: NpcAutonomyState;
  sideTradePlan?: NpcResourceSideTradePlan;
  /** Cumulative real operating charges; no money is created by bookkeeping. */
  civilianOperatingExpenses?: number;
  lastOperatingChargeDay?: number;
}

export type MarketSituationScope = 'local' | 'sector';

export interface MarketSituation {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scope: MarketSituationScope;
  readonly locationId?: EconomyLocationId;
  readonly resourceModifiers: Readonly<Record<EconomyResourceId, number>>;
  readonly startDay: number;
  readonly endDay: number;
}
