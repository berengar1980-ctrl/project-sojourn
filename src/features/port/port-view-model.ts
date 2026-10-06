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
  readonly owned: number;
}

export interface PortCrewView {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly traits: readonly string[];
  readonly ranged: number;
  readonly melee: number;
  readonly share: number;
  readonly elite: boolean;
  readonly equipment: readonly string[];
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
  };
}

const SOCIAL_LABELS: Readonly<Record<string, string>> = {
  loyalty: 'Loyal',
  order: 'Ordnung',
  duty: 'Pflicht',
  risk: 'Risiko',
  empathy: 'Empathie',
  faith: 'Glaube',
  cunning: 'List',
  trust: 'Vertrauen',
};

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
  player: PlayerEconomyState
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
        sellPrice: Math.max(1, Math.round(entry.price * 0.94)),
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

function crewInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
}

function equipmentLabels(equipment: CrewMember['personalEquipment']): readonly string[] {
  return [
    equipment.ranged,
    equipment.melee,
    equipment.armor,
    equipment.gear1,
    equipment.gear2,
  ].filter((value): value is string => Boolean(value));
}

function crewMemberView(member: CrewMember): PortCrewView {
  return {
    id: member.id,
    name: member.name,
    initials: crewInitials(member.name),
    role: member.title,
    traits: Object.entries(member.socialTraits)
      .filter(([, value]) => value !== 0)
      .sort((first, second) => Math.abs(second[1]) - Math.abs(first[1]))
      .slice(0, 3)
      .map(([axis, value]) => `${SOCIAL_LABELS[axis] ?? axis} ${value > 0 ? '+' : ''}${value}`),
    ranged: member.combatSkills.ranged,
    melee: member.combatSkills.melee,
    share: member.share,
    elite: member.elite,
    equipment: equipmentLabels(member.personalEquipment),
  };
}

function resourceName(id: string): string {
  return economyResourceById(id)?.name ?? id;
}

export function createPortViewModel(
  port: PortDefinition,
  market: EconomyMarketState,
  player: PlayerEconomyState,
  location: WorldLocation,
  ship: ShipDefinition,
  crewState: PortCrewStateInput,
  cargoCapacityTons = ship.cargoCapacityTons
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
    market: marketRows(market, player),
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
    },
  };
}
