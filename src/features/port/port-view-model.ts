import type { CrewMember } from '../../core/crew-types';

import type {
  EconomyMarketState,
  PlayerEconomyState,
  ResourceLegality,
} from '../../core/economy-types';

import type { PortDefinition, PortTab } from '../../core/port-types';

import type {
  ShipDefinition,
  ShipStationDefinition,
  ShipStationSkill,
} from '../../core/ship-types';

import type {
  PlanetBiome,
  PlanetRingStyle,
  StationType,
  WorldLocation,
  WorldPoint,
} from '../../core/world-types';

import { economyResourceById, resourceLegalityLabel } from '../../data/economy/economy-resources';

import { playerSaleUnitPrice } from '../../systems/economy/player-trade-service';

import {
  componentSlots,
  shipyardView,
  type PortShipComponentSlotView,
  type PortShipStateInput,
  type PortShipyardStateInput,
  type PortShipyardView,
} from './port-ship-view-model';

import { type PortCrewView, crewMemberView } from './port-crew-view';

export type {
  PortShipComponentSlotView,
  PortShipStateInput,
  PortShipyardLooseComponentView,
  PortShipyardStateInput,
  PortShipyardVariantView,
} from './port-ship-view-model';

export type { PortCrewView } from './port-crew-view';

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
  readonly owned: number;
}

export interface PortSystemMarketInput {
  readonly locationId: string;
  readonly locationName: string;
  readonly locationKind: string;
  readonly distance: number;
  readonly resourceId: string;
  readonly price: number | null;
  readonly stock: number | null;
  readonly observedDay: number | null;
  readonly expectation: 'cheap' | 'neutral' | 'expensive';
}

export interface PortSystemMarketRowView extends PortSystemMarketInput {
  readonly resourceName: string;
  readonly sellPrice: number | null;
  readonly ageDays: number | null;
  readonly intelStatus: 'unknown' | 'live' | 'recent' | 'aging' | 'stale';
  readonly profit: number | null;
}

export interface PortCargoSaleView {
  readonly resourceId: string;
  readonly name: string;
  readonly quantity: number;
  readonly averageCost: number;
  readonly localSellPrice: number;
  readonly localProfit: number;
  readonly rating: 'best' | 'good' | 'mid' | 'poor' | 'loss';
  readonly bestLocationId: string;
  readonly bestLocationName: string;
  readonly bestSellPrice: number;
  readonly bestProfit: number;
  readonly bestAgeDays: number;
  readonly bestDistance: number;
  readonly bestIsHere: boolean;
}

export interface PortStationView {
  readonly id: string;
  readonly label: string;
  readonly skill: ShipStationSkill;
  readonly assignedCrewId: string | null;
}

export interface PortCrewStateView {
  readonly used: number;
  readonly capacity: number;
  readonly candidates: readonly PortCrewView[];
  readonly hired: readonly PortCrewView[];
  readonly stations: readonly PortStationView[];
}

export interface PortLocationVisualView {
  readonly id: string;
  readonly kind: WorldLocation['kind'];
  readonly dangerLevel: WorldLocation['dangerLevel'];
  readonly planetBiome?: PlanetBiome;
  readonly ringStyle?: PlanetRingStyle;
  readonly stationType?: StationType;
  readonly light: WorldPoint;
}

export interface PortCrewStateInput {
  readonly available: readonly CrewMember[];
  readonly hired: readonly CrewMember[];
  readonly assignments: Readonly<Record<string, string | undefined>>;
  readonly stations: readonly ShipStationDefinition[];
  readonly capacity: number;
}

export interface PortViewModel {
  readonly locationId: string;
  readonly locationName: string;
  readonly locationKind: string;
  readonly locationVisual: PortLocationVisualView;
  readonly subtitle: string;
  readonly economy: string;
  readonly population: string;
  readonly security: string;
  readonly description: string;
  readonly shipyardAvailable: boolean;
  readonly shipyard: PortShipyardView;
  readonly tabs: readonly { id: PortTab; label: string; enabled: boolean }[];
  readonly market: readonly PortMarketRowView[];
  readonly cargoSales: readonly PortCargoSaleView[];
  readonly systemMarket: readonly PortSystemMarketRowView[];
  readonly systemMarketResourceIds: readonly string[];
  readonly producedNames: readonly string[];
  readonly neededNames: readonly string[];
  readonly crew: PortCrewStateView;
  readonly player: {
    readonly credits: number;
    readonly cargoUsed: number;
    readonly cargoCapacity: number;
  };
  readonly ship: {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly lengthMeters: number;
    readonly spriteUrl: string;
    readonly components: readonly PortShipComponentSlotView[];
    readonly reactorOutput: number;
    readonly combatPowerUsed: number;
    readonly combatPowerFree: number;
    readonly hullMaxHp: number;
    readonly shieldMaxHp: number;
  };
}

const STATION_LABELS: Readonly<Record<string, string>> = {
  helm: 'Brücke',
  sensor_station: 'Sensorik',
  weapon_station: 'Waffen',
  secondary_weapon_station: 'Waffen II',
  engine_room: 'Maschinenraum',
  damage_control: 'Schadenskontrolle',
  mining_station: 'Mining',
  secondary_mining_station: 'Mining II',
  salvage_control: 'Bergung',
  secondary_salvage_control: 'Bergung II',
  cargo_control: 'Fracht',
  cargo_coordination: 'Frachtkoordination',
  combat_auspex: 'Kampf-Auspex',
};

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

function marketRows(
  market: EconomyMarketState,
  player: PlayerEconomyState,
  saleFeeRate: number
): readonly PortMarketRowView[] {
  return Object.values(market.entries)
    .map((entry) => {
      const resource = economyResourceById(entry.resourceId);
      if (!resource) throw new Error(`Unknown market resource: ${entry.resourceId}`);
      const referenceDelta = (entry.price - resource.basePrice) / resource.basePrice;
      const trend: PortMarketRowView['trend'] =
        referenceDelta > 0.06 ? 'up' : referenceDelta < -0.06 ? 'down' : 'flat';

      return {
        id: resource.id,
        name: resource.name,
        category: resource.category,
        legality: resource.legality,
        legalityLabel: resourceLegalityLabel(resource.id),
        buyPrice: entry.price,
        sellPrice: playerSaleUnitPrice(entry.price, saleFeeRate),
        stock: Math.round(entry.stock),
        demandLabel: demandLabel(entry.demand),
        productionLabel: productionLabel(entry.production),
        trend,
        pressurePercent: Math.round(referenceDelta * 100),
        owned: player.cargo[resource.id]?.qty ?? 0,
      };
    })
    .sort((first, second) => {
      const category = first.category.localeCompare(second.category);
      return category !== 0 ? category : first.name.localeCompare(second.name);
    });
}

function intelStatus(ageDays: number | null): PortSystemMarketRowView['intelStatus'] {
  if (ageDays === null) return 'unknown';
  if (ageDays <= 0) return 'live';
  if (ageDays <= 2) return 'recent';
  if (ageDays <= 5) return 'aging';
  return 'stale';
}

function systemRows(
  input: readonly PortSystemMarketInput[],
  player: PlayerEconomyState,
  currentDay: number,
  saleFeeRate: number
): PortSystemMarketRowView[] {
  return input
    .map((entry) => {
      const lot = player.cargo[entry.resourceId];
      const sellPrice = entry.price === null ? null : playerSaleUnitPrice(entry.price, saleFeeRate);
      const revenue = lot && sellPrice !== null ? sellPrice * lot.qty : 0;
      const profit = lot && sellPrice !== null ? Math.round(revenue - lot.totalCost) : null;
      const ageDays =
        entry.observedDay === null ? null : Math.max(0, currentDay - entry.observedDay);
      return {
        ...entry,
        resourceName: economyResourceById(entry.resourceId)?.name ?? entry.resourceId,
        sellPrice,
        ageDays,
        intelStatus: intelStatus(ageDays),
        profit,
      };
    })
    .sort((a, b) => {
      const resource = a.resourceName.localeCompare(b.resourceName);
      if (resource !== 0) return resource;
      if (a.sellPrice === null && b.sellPrice !== null) return 1;
      if (a.sellPrice !== null && b.sellPrice === null) return -1;
      return (b.sellPrice ?? 0) - (a.sellPrice ?? 0);
    });
}

function cargoSaleRows(
  market: readonly PortMarketRowView[],
  system: readonly PortSystemMarketRowView[],
  player: PlayerEconomyState,
  locationId: string
): PortCargoSaleView[] {
  return Object.entries(player.cargo)
    .filter(([, lot]) => lot.qty > 0)
    .map(([resourceId, lot]) => {
      const local = market.find((entry) => entry.id === resourceId);
      const localSellPrice = local?.sellPrice ?? 0;
      const localProfit = Math.round(localSellPrice * lot.qty - lot.totalCost);
      const candidates = system
        .flatMap((entry) => {
          if (
            entry.resourceId !== resourceId ||
            entry.sellPrice === null ||
            entry.ageDays === null
          ) {
            return [];
          }
          return [
            {
              ...entry,
              sellPrice: entry.sellPrice,
              ageDays: entry.ageDays,
              saleProfit: Math.round(entry.sellPrice * lot.qty - lot.totalCost),
            },
          ];
        })
        .sort((a, b) => b.saleProfit - a.saleProfit || a.ageDays - b.ageDays);
      const best = candidates[0] ?? {
        locationId,
        locationName: 'Unbekannt',
        sellPrice: localSellPrice,
        saleProfit: localProfit,
        ageDays: 0,
        distance: 0,
      };
      const span = Math.max(
        1,
        best.saleProfit - Math.min(...candidates.map((entry) => entry.saleProfit), localProfit)
      );
      const relative = (localProfit - (best.saleProfit - span)) / span;
      const rating: PortCargoSaleView['rating'] =
        localProfit < 0
          ? 'loss'
          : best.locationId === locationId
            ? 'best'
            : relative >= 0.75
              ? 'good'
              : relative >= 0.45
                ? 'mid'
                : 'poor';
      return {
        resourceId,
        name: economyResourceById(resourceId)?.name ?? resourceId,
        quantity: lot.qty,
        averageCost: lot.qty > 0 ? lot.totalCost / lot.qty : 0,
        localSellPrice,
        localProfit,
        rating,
        bestLocationId: best.locationId,
        bestLocationName: best.locationName,
        bestSellPrice: best.sellPrice,
        bestProfit: best.saleProfit,
        bestAgeDays: best.ageDays,
        bestDistance: best.distance,
        bestIsHere: best.locationId === locationId,
      };
    })
    .sort((a, b) => b.localProfit - a.localProfit);
}

function resourceName(id: string): string {
  return economyResourceById(id)?.name ?? id;
}

export function createPortViewModel(
  port: PortDefinition,
  market: EconomyMarketState,
  player: PlayerEconomyState,
  location: WorldLocation,
  starPosition: WorldPoint,
  ship: ShipDefinition,
  crewState: PortCrewStateInput,
  shipState: PortShipStateInput,
  systemMarketInput: readonly PortSystemMarketInput[],
  currentDay: number,
  cargoCapacityTons = ship.cargoCapacityTons,
  saleFeeRate = 0.06,
  shipyardState: PortShipyardStateInput = { loose: [], variants: [] }
): PortViewModel {
  const localMarket = marketRows(market, player, saleFeeRate);
  const systemMarket = systemRows(systemMarketInput, player, currentDay, saleFeeRate);
  return {
    locationId: location.id,
    locationName: location.name,
    locationKind: location.kind === 'station' ? 'ORBITALSTATION' : 'PLANET',
    locationVisual: {
      id: location.id,
      kind: location.kind,
      dangerLevel: location.dangerLevel,
      ...(location.planetBiome ? { planetBiome: location.planetBiome } : {}),
      ...(location.ringStyle ? { ringStyle: location.ringStyle } : {}),
      ...(location.stationType ? { stationType: location.stationType } : {}),
      light: {
        x: starPosition.x - location.position.x,
        y: starPosition.y - location.position.y,
      },
    },
    subtitle: port.subtitle,
    economy: port.economy,
    population: port.population,
    security: port.security.toUpperCase(),
    description: location.description,
    shipyardAvailable: port.shipyard,
    shipyard: shipyardView(shipyardState),
    tabs: [
      { id: 'trade', label: 'HANDEL', enabled: true },
      { id: 'ship', label: 'SCHIFF', enabled: true },
      { id: 'crew', label: 'CREW', enabled: true },
      { id: 'equipment', label: 'AUSRÜSTUNG', enabled: true },
      { id: 'shipyard', label: 'WERFT', enabled: port.shipyard },
    ],
    market: localMarket,
    cargoSales: cargoSaleRows(localMarket, systemMarket, player, location.id),
    systemMarket,
    systemMarketResourceIds: [...new Set(systemMarket.map((entry) => entry.resourceId))],
    producedNames: port.producedCommodityIds.map(resourceName),
    neededNames: port.neededCommodityIds.map(resourceName),
    crew: {
      used: 1 + crewState.hired.length,
      capacity: crewState.capacity,
      candidates: crewState.available.map(crewMemberView),
      hired: crewState.hired.map(crewMemberView),
      stations: crewState.stations.map((station) => ({
        id: station.id,
        label: STATION_LABELS[station.id] ?? station.id,
        skill: station.skill,
        assignedCrewId: crewState.assignments[station.id] ?? null,
      })),
    },
    player: {
      credits: player.credits,
      cargoUsed: Object.values(player.cargo).reduce((sum, lot) => sum + lot.qty, 0),
      cargoCapacity: cargoCapacityTons,
    },
    ship: {
      id: ship.id,
      name: ship.name,
      role: ship.role,
      lengthMeters: ship.nominalLengthMeters,
      spriteUrl: ship.sprite.assetUrl,
      components: componentSlots(ship, shipState),
      reactorOutput: shipState.reactorOutput,
      combatPowerUsed: shipState.combatPowerUsed,
      combatPowerFree: shipState.combatPowerFree,
      hullMaxHp: shipState.hullMaxHp,
      shieldMaxHp: shipState.shieldMaxHp,
    },
  };
}
