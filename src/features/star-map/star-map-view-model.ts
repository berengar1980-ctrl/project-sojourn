import type { CargoMarketScanner } from '../../systems/economy/cargo-market-scanner';
import type { NpcCombatMovementMode } from '../../core/npc-types';
import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import type {
  LocationActivities,
  LocationKind,
  PlanetBiome,
  PlanetRingStyle,
  StationType,
  StarBody,
  WorldLocation,
  WorldMap,
  WorldPoint,
} from '../../core/world-types';
import type { NavigationSnapshot } from '../../systems/navigation/navigation-types';
import type { RoutePlan } from '../../systems/navigation/route-planner';
import type { FuelRoutePlan } from '../../systems/navigation/fuel-route-planner';

export interface StarMapLocationView {
  readonly id: string;
  readonly name: string;
  readonly kind: LocationKind;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly orbitRadius?: number;
  readonly parentLocationId?: string;
  readonly planetBiome?: PlanetBiome;
  readonly ringStyle?: PlanetRingStyle;
  readonly stationType?: StationType;
  readonly showOrbit?: boolean;
  readonly spriteUrl?: string;
  readonly description: string;
  readonly activities: LocationActivities;
  readonly dangerLevel: 0 | 1 | 2 | 3;
  readonly isCurrent: boolean;
  readonly isSelected: boolean;
}

export interface NpcShipMapView {
  readonly id: string;
  readonly name: string;
  readonly job: 'freighter' | 'miner' | 'salvager' | 'patrol' | 'pirate';
  readonly factionId?: 'civilian' | 'pirates' | 'pirates2';
  readonly pirateMark?: 'broken-spear' | 'black-tide';
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly isTravelling: boolean;
  readonly activity: string;
  readonly combatMode: NpcCombatMovementMode | null;
  readonly nominalLengthMeters: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
  readonly hardpoints: ShipHardpoints;
  readonly isSelected?: boolean;
  readonly isPursuitTarget?: boolean;
}

export interface PlayerShipMapView {
  readonly name: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
  readonly isTravelling: boolean;
  readonly speed: number;
  readonly nominalLengthMeters: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
  readonly hardpoints: ShipHardpoints;
}

export interface StarMapFuelView {
  readonly fuel: number;
  readonly capacity: number;
  readonly fuelPerHundred: number;
  readonly planned: FuelRoutePlan | null;
  readonly unreachable: boolean;
}

export interface StarMapViewModel {
  readonly fuelStatus?: StarMapFuelView;
  readonly worldId: string;
  readonly title: string;
  readonly cargoScanner?: CargoMarketScanner;
  readonly width: number;
  readonly height: number;
  readonly star: StarBody;
  readonly locations: readonly StarMapLocationView[];
  readonly regions: WorldMap['regions'];
  readonly npcShips: readonly NpcShipMapView[];
  readonly route: RoutePlan | null;
  readonly playerShip: PlayerShipMapView;
  readonly navigation: NavigationSnapshot;
}

export function createStarMapViewModel(
  world: WorldMap,
  navigation: NavigationSnapshot,
  ship: ShipDefinition,
  npcShips: readonly NpcShipMapView[] = [],
  selectedNpcId: string | null = null,
  dynamicLocations: readonly WorldLocation[] = []
): StarMapViewModel {
  return {
    worldId: world.id,
    title: world.name,
    width: world.width,
    height: world.height,
    star: world.star,
    regions: world.regions,
    npcShips: npcShips.map((npc) => ({
      ...npc,
      isSelected: npc.id === selectedNpcId,
      isPursuitTarget: npc.id === navigation.pursuitTargetId,
    })),
    route: navigation.activeRoute ?? navigation.previewRoute,
    navigation,
    playerShip: {
      name: ship.name,
      position: navigation.currentPosition,
      headingRadians: navigation.headingRadians,
      turnRateRadiansPerSecond: navigation.turnRateRadiansPerSecond,
      angularThrust: navigation.angularThrust,
      lateralThrust: navigation.lateralThrust,
      isTravelling: navigation.isTravelling,
      speed: navigation.speed,
      nominalLengthMeters: ship.nominalLengthMeters,
      spriteUrl: ship.sprite.assetUrl,
      spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
      hardpoints: ship.sprite.hardpoints,
    },
    locations: [...world.locations, ...dynamicLocations].map((location) => ({
      ...location,
      isCurrent: location.id === navigation.currentLocationId,
      isSelected: location.id === navigation.selectedDestinationId,
    })),
  };
}
