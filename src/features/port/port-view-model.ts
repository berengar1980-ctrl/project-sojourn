import type {
  PortMarketRowView,
  PortSystemMarketInput,
  PortSystemMarketRowView,
  PortCargoSaleView,
} from './port-market-view-model';
export type {
  PortMarketRowView,
  PortSystemMarketInput,
  PortSystemMarketRowView,
  PortCargoSaleView,
} from './port-market-view-model';
import { marketRows, systemRows, cargoSaleRows } from './port-market-view-model';
import type { CrewMember } from '../../core/crew-types';
import type { CrewSkillEffects } from '../../systems/crew/crew-skill-effects';
import { stationEffectSummary } from './port-station-effect-summary';
import type { TradeCharterService } from '../../systems/economy/trade-charter-service';

import type { EconomyMarketState, PlayerEconomyState } from '../../core/economy-types';

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

import { economyResourceById } from '../../data/economy/economy-resources';

import { playerCargoUsed } from '../../systems/economy/player-trade-service';

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

export interface PortStationView {
  readonly id: string;
  readonly label: string;
  readonly skill: ShipStationSkill;
  readonly assignedCrewId: string | null;
  readonly performance: number;
  readonly effectSummary: string;
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
  readonly stationSkills?: Readonly<Record<ShipStationSkill, number>>;
  readonly effects?: CrewSkillEffects;
}

export interface PortOperationsView {
  readonly fuel: number;
  readonly fuelCapacity: number;
  readonly hullHp: number;
  readonly hullMaxHp: number;
  readonly repairPrice: number;
  readonly repairPoints: number;
  readonly affordableRepairCost: number;
  readonly shipyardDiscount: boolean;
}

export interface PortViewModel {
  readonly shipRegistration?: {
    readonly transponder: string;
    readonly originalTransponder: string;
    readonly wanted: boolean;
    readonly debt: number;
    readonly forged: boolean;
    readonly pirateStation: boolean;
  };
  readonly charter?: {
    readonly active: TradeCharterService['active'];
    readonly offers: TradeCharterService['offers'];
    readonly feeRate: number;
  };
  readonly operations: PortOperationsView;
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
  readonly saleFeeRate: number;
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

function resourceName(id: string): string {
  return economyResourceById(id)?.name ?? id;
}

function defaultPortOperations(shipState: PortShipStateInput): PortOperationsView {
  return {
    fuel: 0,
    fuelCapacity: 0,
    hullHp: shipState.hullMaxHp,
    hullMaxHp: shipState.hullMaxHp,
    repairPrice: 0,
    repairPoints: 0,
    affordableRepairCost: 0,
    shipyardDiscount: false,
  };
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
  saleFeeRate = 0.25,
  shipyardState: PortShipyardStateInput = { loose: [], variants: [] },
  operations: PortOperationsView = defaultPortOperations(shipState),
  charter?: TradeCharterService
): PortViewModel {
  const localMarket = marketRows(market, player, saleFeeRate);
  const systemMarket = systemRows(systemMarketInput, player, currentDay, saleFeeRate);
  return {
    ...(charter
      ? { charter: { active: charter.active, offers: charter.offers, feeRate: saleFeeRate } }
      : {}),
    operations,
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
    saleFeeRate,
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
        performance: crewState.stationSkills?.[station.skill] ?? 20,
        effectSummary: crewState.effects
          ? stationEffectSummary(station.skill, crewState.effects)
          : '',
      })),
    },
    player: {
      credits: player.credits,
      cargoUsed: playerCargoUsed(player),
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
