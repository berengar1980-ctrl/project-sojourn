export type PortTab = 'trade' | 'crew' | 'equipment' | 'shipyard';

export type CommodityId =
  | 'steel'
  | 'fuel'
  | 'food'
  | 'machine-parts'
  | 'electronics'
  | 'medicine'
  | 'promethium'
  | 'water'
  | 'ferrite';

export interface PortCommodityDefinition {
  readonly id: CommodityId;
  readonly name: string;
  readonly basePrice: number;
  readonly stock: number;
  readonly demand: number;
  readonly production: number;
}

export interface PortCrewCandidate {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly traits: readonly string[];
  readonly combat: number;
  readonly salary: number;
  readonly equipment: readonly string[];
}

export interface PortDefinition {
  readonly locationId: string;
  readonly subtitle: string;
  readonly economy: string;
  readonly population: string;
  readonly security: 'low' | 'medium' | 'high';
  readonly shipyard: boolean;
  readonly commodities: readonly PortCommodityDefinition[];
  readonly crew: readonly PortCrewCandidate[];
  readonly producedCommodityIds: readonly CommodityId[];
  readonly neededCommodityIds: readonly CommodityId[];
}
