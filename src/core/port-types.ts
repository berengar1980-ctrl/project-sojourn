import type { EconomyResourceId } from './economy-types';

export type PortTab = 'trade' | 'crew' | 'equipment' | 'shipyard';

export interface PortCommodityDefinition {
  readonly id: EconomyResourceId;
  readonly stock: number;
  readonly demand: number;
  readonly production: number;
}

export interface PortDefinition {
  readonly locationId: string;
  readonly subtitle: string;
  readonly economy: string;
  readonly population: string;
  readonly security: 'low' | 'medium' | 'high';
  readonly shipyard: boolean;
  readonly commodities: readonly PortCommodityDefinition[];
  readonly producedCommodityIds: readonly EconomyResourceId[];
  readonly neededCommodityIds: readonly EconomyResourceId[];
}
