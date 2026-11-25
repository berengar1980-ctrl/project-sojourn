import type { EconomyResourceId, NpcEconomyState } from '../../core/economy-types';

import { type EconomyPoint } from './npc-resource-side-trade';

export interface PhysicalResourceAllocator {
  createMinedResource(resourceId: EconomyResourceId, amount: number): number;
  allocatePhysicalResource(resourceId: EconomyResourceId, amount: number): number;
  getPhysicalStock?(resourceId: string, sourceId: string): number | undefined;
  withdrawPhysicalStock?(resourceId: string, sourceId: string, amount: number): number;
}

export interface TradeRoute {
  readonly resourceId: EconomyResourceId;
  readonly destinationId: string;
  readonly quantity: number;
  readonly margin: number;
  readonly observedDay: number;
  readonly score: number;
}

export interface NpcEconomyCheckpoint {
  readonly version: 1;
  readonly lastDay: number;
  readonly npcIds: readonly string[];
}

export interface NpcEconomyService {
  exportState(): NpcEconomyCheckpoint;
  readonly npcs: readonly NpcEconomyState[];
  mineLocal(
    npc: NpcEconomyState,
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    sourceId?: string
  ): number;
  salvageLocal(
    npc: NpcEconomyState,
    resourceId: EconomyResourceId,
    requestedQuantity: number,
    sourceId?: string
  ): number;
  dispatchLoadedWorker(npc: NpcEconomyState): boolean;
  tick(deltaSeconds: number): void;
  advanceDay(day: number): void;
  advanceNextDay(): void;
}

/** Estimated cash requirements and fuel cost for a real, affordable physical voyage. */
export interface NpcTravelOperatingQuote {
  readonly distance: number;
  readonly refuelCost: number;
  /** Economic cost of consumed fuel, including fuel already aboard. */
  readonly fuelExpense: number;
}

export interface NpcEconomyServiceOptions {
  readonly isManaged?: (npc: NpcEconomyState) => boolean;
  readonly canTrade?: (npc: NpcEconomyState, locationId: string, resourceId: string) => boolean;
  readonly miningAllowance?: (npc: NpcEconomyState, resourceId: string, amount: number) => number;
  readonly onMined?: (npc: NpcEconomyState, resourceId: string, amount: number) => void;
  /** Optional settlement hook for actual illegal cargo sales. */
  readonly onSale?: (
    npc: NpcEconomyState,
    resourceId: string,
    quantity: number,
    gross: number
  ) => void;
  readonly positions?: Readonly<Record<string, EconomyPoint>>;
  readonly travel?: {
    readonly requestTravel: (
      npc: NpcEconomyState,
      destinationId: string,
      reason: string
    ) => boolean;
    readonly requestPatrol?: (npc: NpcEconomyState) => boolean;
    readonly isTravelling: (npc: NpcEconomyState) => boolean;
    readonly quoteTravel?: (
      npc: NpcEconomyState,
      destinationId: string,
      creditsAvailable: number
    ) => NpcTravelOperatingQuote | null;
  };
}
