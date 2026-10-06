import type { CrewMember } from '../../core/crew-types';
import type {
  EconomyMarketState,
  PlayerEconomyState,
  ResourceLegality,
} from '../../core/economy-types';
import type { PortDefinition, PortTab } from '../../core/port-types';
import type {
  ShipComponentType,
  ShipDefinition,
  ShipStationDefinition,
  ShipStationSkill,
} from '../../core/ship-types';
import type { WorldLocation } from '../../core/world-types';
import { economyResourceById, resourceLegalityLabel } from '../../data/economy/economy-resources';
import { getShipComponent, type InstalledShipComponents } from '../../systems/ships';

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
  readonly price: number;
  readonly stock: number;
  readonly observedDay: number;
}

export interface PortSystemMarketRowView extends PortSystemMarketInput {
  readonly resourceName: string;
  readonly sellPrice: number;
  readonly ageDays: number;
  readonly intelStatus: 'live' | 'recent' | 'aging' | 'stale';
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

export interface PortShipComponentSlotView {
  readonly key: string;
  readonly type: ShipComponentType;
  readonly typeLabel: string;
  readonly index: number;
  readonly componentId: string | null;
  readonly name: string;
  readonly tier: number | null;
  readonly power: number;
  readonly weaponSlot: boolean;
}

export interface PortShipStateInput {
  readonly installed: InstalledShipComponents;
  readonly weaponSlots: number;
  readonly reactorOutput: number;
  readonly combatPowerUsed: number;
  readonly combatPowerFree: number;
  readonly hullMaxHp: number;
  readonly shieldMaxHp: number;
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

const COMPONENT_LABELS: Readonly<Record<ShipComponentType, string>> = {
  reactor: 'Reaktor',
  engine: 'Antrieb',
  shield: 'Schildgenerator',
  hull: 'Hüllenverstärkung',
  sensor: 'Sensoren',
  weapon: 'Waffe',
  cargo: 'Frachtmodul',
  mining: 'Mining-System',
  salvage: 'Bergungssystem',
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

function intelStatus(ageDays: number): PortSystemMarketRowView['intelStatus'] {
  if (ageDays <= 0) return 'live';
  if (ageDays <= 2) return 'recent';
  if (ageDays <= 5) return 'aging';
  return 'stale';
}

function systemRows(
  input: readonly PortSystemMarketInput[],
  player: PlayerEconomyState,
  currentDay: number
): PortSystemMarketRowView[] {
  return input
    .map((entry) => {
      const lot = player.cargo[entry.resourceId];
      const sellPrice = Math.max(1, Math.round(entry.price * 0.94));
      const revenue = lot ? sellPrice * lot.qty : 0;
      const profit = lot ? Math.round(revenue - lot.totalCost) : null;
      const ageDays = Math.max(0, currentDay - entry.observedDay);
      return {
        ...entry,
        resourceName: economyResourceById(entry.resourceId)?.name ?? entry.resourceId,
        sellPrice,
        ageDays,
        intelStatus: intelStatus(ageDays),
        profit,
      };
    })
    .sort((a, b) => a.resourceName.localeCompare(b.resourceName) || b.sellPrice - a.sellPrice);
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
        .filter((entry) => entry.resourceId === resourceId)
        .map((entry) => ({
          ...entry,
          saleProfit: Math.round(entry.sellPrice * lot.qty - lot.totalCost),
        }))
        .sort((a, b) => b.saleProfit - a.saleProfit || a.ageDays - b.ageDays);
      const best = candidates[0] ?? {
        locationId,
        locationName: 'Unbekannt',
        sellPrice: localSellPrice,
        saleProfit: localProfit,
        ageDays: 0,
        distance: 0,
      };
      const span = Math.max(1, best.saleProfit - Math.min(...candidates.map((entry) => entry.saleProfit), localProfit));
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

function componentSlots(ship: ShipDefinition, state: PortShipStateInput): PortShipComponentSlotView[] {
  const types: ShipComponentType[] = ['reactor', 'engine', 'shield', 'hull', 'sensor', 'cargo'];
  if (ship.role === 'mining') types.push('mining');
  if (ship.role === 'salvage') types.push('salvage');

  const slots: PortShipComponentSlotView[] = [];
  for (const type of types) {
    const id = state.installed[type]?.[0] || null;
    const definition = id ? getShipComponent(type, id) : null;
    slots.push({
      key: type + '-0',
      type,
      typeLabel: COMPONENT_LABELS[type],
      index: 0,
      componentId: id,
      name: definition?.name ?? 'LEER',
      tier: definition?.tier ?? null,
      power: definition?.power ?? 0,
      weaponSlot: false,
    });
  }
  for (let index = 0; index < state.weaponSlots; index += 1) {
    const id = state.installed.weapon?.[index] || null;
    const definition = id ? getShipComponent('weapon', id) : null;
    slots.push({
      key: 'weapon-' + index,
      type: 'weapon',
      typeLabel: `Waffenhalterung ${index + 1}`,
      index,
      componentId: id,
      name: definition?.name ?? 'LEER',
      tier: definition?.tier ?? null,
      power: definition?.power ?? 0,
      weaponSlot: true,
    });
  }
  return slots;
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
  shipState: PortShipStateInput,
  systemMarketInput: readonly PortSystemMarketInput[],
  currentDay: number,
  cargoCapacityTons = ship.cargoCapacityTons
): PortViewModel {
  const localMarket = marketRows(market, player);
  const systemMarket = systemRows(systemMarketInput, player, currentDay);
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
