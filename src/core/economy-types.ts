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
}

export interface PlayerEconomyState {
  credits: number;
  readonly cargo: Record<EconomyResourceId, PlayerCargoLot>;
}

export interface TradeResult {
  readonly resourceId: EconomyResourceId;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly creditsDelta: number;
  readonly realizedProfit: number;
}

export type NpcEconomyRole = 'trader' | 'miner' | 'salvager';

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
  readonly cargoCapacity: number;
  readonly normalCargoCapacity?: number;
  readonly cargo: Record<EconomyResourceId, number>;
  readonly workResourceIds: readonly EconomyResourceId[];
  readonly workLocationId?: EconomyLocationId;
  sideTradePlan?: NpcResourceSideTradePlan;
}
