import type { PortDefinition, PortTab } from '../../core/port-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { WorldLocation } from '../../core/world-types';

export interface PortMarketRowView {
  readonly id: string;
  readonly name: string;
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

function marketPrice(basePrice: number, stock: number, demand: number, production: number): number {
  const stockPressure = Math.max(-0.38, Math.min(0.45, (2600 - stock) / 8200));
  const demandPressure = (demand - 0.5) * 0.72;
  const productionPressure = (production - 0.5) * -0.38;
  return Math.max(1, Math.round(basePrice * (1 + stockPressure + demandPressure + productionPressure)));
}

function marketRows(port: PortDefinition): readonly PortMarketRowView[] {
  return port.commodities.map((commodity) => {
    const buyPrice = marketPrice(
      commodity.basePrice,
      commodity.stock,
      commodity.demand,
      commodity.production
    );
    const referenceDelta = (buyPrice - commodity.basePrice) / commodity.basePrice;
    return {
      id: commodity.id,
      name: commodity.name,
      buyPrice,
      sellPrice: Math.max(1, Math.round(buyPrice * 0.94)),
      stock: commodity.stock,
      demandLabel: demandLabel(commodity.demand),
      productionLabel: productionLabel(commodity.production),
      trend: referenceDelta > 0.06 ? 'up' : referenceDelta < -0.06 ? 'down' : 'flat',
      pressurePercent: Math.round(referenceDelta * 100),
    };
  });
}

function crewInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
}

export function createPortViewModel(
  port: PortDefinition,
  location: WorldLocation,
  ship: ShipDefinition
): PortViewModel {
  const market = marketRows(port);
  const commodityName = (id: string) => market.find((row) => row.id === id)?.name ?? id;

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
    market,
    producedNames: port.producedCommodityIds.map(commodityName),
    neededNames: port.neededCommodityIds.map(commodityName),
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
