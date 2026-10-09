import type { EconomyResourceId } from '../../core/economy-types';
import type { PortCommodityDefinition, PortDefinition } from '../../core/port-types';
import { economyResourceById, economyResources } from '../economy/economy-resources';
import { sectorPortProfiles, type PortProfile } from './sector-port-profiles';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function commodity(
  id: EconomyResourceId,
  role: 'produces' | 'needs' | 'trade'
): PortCommodityDefinition {
  const basePrice = economyResourceById(id)?.basePrice ?? 100;
  const baseline = clamp(Math.round(240000 / Math.max(1, basePrice)), 36, 8000);
  if (role === 'produces') {
    return {
      id,
      stock: clamp(Math.round(baseline * 2.15), 80, 14000),
      demand: 0.34,
      production: 0.84,
    };
  }
  if (role === 'needs') {
    return {
      id,
      stock: clamp(Math.round(baseline * 0.48), 18, 4200),
      demand: 0.86,
      production: 0.04,
    };
  }
  return {
    id,
    stock: clamp(Math.round(baseline * 2), 28, 7600),
    demand: 0.12,
    production: 0.02,
  };
}

function makePort(profile: PortProfile): PortDefinition {
  const produced = new Set(profile.produces);
  const needed = new Set(profile.needs);
  const commodityIds = [
    ...new Set([
      ...profile.produces,
      ...profile.needs,
      ...(profile.trades ?? []),
      ...economyResources.filter((resource) => resource.legality === 'legal').map((resource) => resource.id),
    ]),
  ];
  return {
    locationId: profile.locationId,
    subtitle: profile.subtitle,
    economy: profile.economy,
    population: profile.population,
    security: profile.security,
    shipyard: profile.shipyard ?? false,
    producedCommodityIds: [...profile.produces],
    neededCommodityIds: [...profile.needs],
    commodities: commodityIds.map((id) =>
      commodity(id, produced.has(id) ? 'produces' : needed.has(id) ? 'needs' : 'trade')
    ),
  };
}

export const sectorPorts: readonly PortDefinition[] = sectorPortProfiles.map(makePort);

export function sectorPortByLocationId(locationId: string): PortDefinition | null {
  return sectorPorts.find((port) => port.locationId === locationId) ?? null;
}
