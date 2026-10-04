import type { EconomyMarketState, ResourceLegality } from '../../core/economy-types';
import type { PortDefinition, PortTab } from '../../core/port-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldLocation } from '../../core/world-types';
import { economyResourceById, resourceLegalityLabel } from '../../data/economy/economy-resources';

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
}

export interface PortCrewView {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly traits: readonly string[];
  readonly combat: number;
  readonly salary: number;
  readonly equipment: readonly string[];
}

export interface PortViewModel {
  readonly locationId: string;
  readonly locationName: string;
  readonly locationKind: string;
  readonly subtitle: string;
  readonly economy: string;
  readonly population: string;
  readonly security: string;
  readonly description: string;
  readonly shipyardAvailable: boolean;
  readonly tabs: readonly { id: PortTab; label: string; enabled: boolean }[];
  readonly market: readonly PortMarketRowView[];
  readonly producedNames: readonly string[];
  readonly neededNames: readonly string[];
  readonly crew: readonly PortCrewView[];
  readonly ship: {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly lengthMeters: number;
    readonly spriteUrl: string;
  };
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

function marketRows(market: EconomyMarketState): readonly PortMarketRowView[] {
  return Object.values(market.entries)
    .map((entry) => {
      const resource = economyResourceById(entry.resourceId);
      if (!resource) throw new Error(`Unknown market resource: ${entry.resourceId}`);
      const referenceDelta = (entry.price - resource.basePrice) / resource.basePrice;

      return {
        id: resource.id,
        name: resource.name,
        category: resource.category,
        legality: resource.legality,
        legalityLabel: resourceLegalityLabel(resource.id),
        buyPrice: entry.price,
        sellPrice: Math.max(1, Math.round(entry.price * 0.94)),
        stock: Math.round(entry.stock),
        demandLabel: demandLabel(entry.demand),
        productionLabel: productionLabel(entry.production),
        trend: referenceDelta > 0.06 ? 'up' : referenceDelta < -0.06 ? 'down' : 'flat',
        pressurePercent: Math.round(referenceDelta * 100),
      };
    })
    .sort((first, second) => {
      const category = first.category.localeCompare(second.category);
      return category !== 0 ? category : first.name.localeCompare(second.name);
    });
}

function crewInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
}

function resourceName(id: string): string {
  return economyResourceById(id)?.name ?? id;
}

export function createPortViewModel(
  port: PortDefinition,
  market: EconomyMarketState,
  location: WorldLocation,
  ship: ShipDefinition
): PortViewModel {
  return {
    locationId: location.id,
    locationName: location.name,
    locationKind: location.kind === 'station' ? 'ORBITALSTATION' : 'PLANET',
    subtitle: port.subtitle,
    economy: port.economy,
    population: port.population,
    security: port.security.toUpperCase(),
    description: location.description,
    shipyardAvailable: port.shipyard,
    tabs: [
      { id: 'trade', label: 'HANDEL', enabled: true },
      { id: 'crew', label: 'CREW', enabled: true },
      { id: 'equipment', label: 'AUSRÜSTUNG', enabled: true },
      { id: 'shipyard', label: 'WERFT', enabled: port.shipyard },
    ],
    market: marketRows(market),
    producedNames: port.producedCommodityIds.map(resourceName),
    neededNames: port.neededCommodityIds.map(resourceName),
    crew: port.crew.map((candidate) => ({
      ...candidate,
      initials: crewInitials(candidate.name),
    })),
    ship: {
      id: ship.id,
      name: ship.name,
      role: ship.role,
      lengthMeters: ship.nominalLengthMeters,
      spriteUrl: ship.sprite.assetUrl,
    },
  };
}
