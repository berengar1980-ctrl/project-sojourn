export type EconomyResourceId = string;
export type EconomyLocationId = string;

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
