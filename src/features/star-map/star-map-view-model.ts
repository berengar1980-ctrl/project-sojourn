import type {
  LocationActivities,
  LocationKind,
  StarBody,
  WorldMap,
  WorldPoint,
} from '../../core/world-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { NavigationSnapshot } from '../../systems/navigation/navigation-types';
import type { RoutePlan } from '../../systems/navigation/route-planner';

export interface StarMapLocationView {
  readonly id: string;
  readonly name: string;
  readonly kind: LocationKind;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly orbitRadius?: number;
  readonly description: string;
  readonly activities: LocationActivities;
  readonly dangerLevel: 0 | 1 | 2 | 3;
  readonly isCurrent: boolean;
  readonly isSelected: boolean;
}

export interface PlayerShipMapView {
  readonly name: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly isTravelling: boolean;
  readonly speed: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
}

export interface StarMapViewModel {
  readonly worldId: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly star: StarBody;
  readonly locations: readonly StarMapLocationView[];
  readonly regions: WorldMap['regions'];
  readonly route: RoutePlan | null;
  readonly playerShip: PlayerShipMapView;
  readonly navigation: NavigationSnapshot;
}

export function createStarMapViewModel(
  world: WorldMap,
  navigation: NavigationSnapshot,
  ship: ShipDefinition
): StarMapViewModel {
  return {
    worldId: world.id,
    title: world.name,
    width: world.width,
    height: world.height,
    star: world.star,
    regions: world.regions,
    route: navigation.activeRoute ?? navigation.previewRoute,
    navigation,
    playerShip: {
      name: ship.name,
      position: navigation.currentPosition,
      headingRadians: navigation.headingRadians,
      isTravelling: navigation.isTravelling,
      speed: navigation.speed,
      spriteUrl: ship.sprite.assetUrl,
      spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
    },
    locations: world.locations.map((location) => ({
      ...location,
      isCurrent: location.id === navigation.currentLocationId,
      isSelected: location.id === navigation.selectedDestinationId,
    })),
  };
}
