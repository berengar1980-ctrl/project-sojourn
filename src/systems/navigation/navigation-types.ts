import type { WorldMap, WorldPoint } from '../../core/world-types';
import type { RoutePlan, RouteProfile, RouteThreatContact } from './route-planner';

export interface NavigationSnapshot {
  readonly currentLocationId: string | null;
  readonly selectedDestinationId: string | null;
  readonly destinationId: string | null;
  readonly pursuitTargetId: string | null;
  readonly currentPosition: WorldPoint;
  readonly headingRadians: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
  readonly isTravelling: boolean;
  readonly isPursuing: boolean;
  readonly progress: number;
  readonly speed: number;
  readonly previewRoute: RoutePlan | null;
  readonly activeRoute: RoutePlan | null;
  readonly routeProfile: RouteProfile;
  readonly threatRevision: number;
  readonly threatContacts: readonly RouteThreatContact[];
}

export interface NavigationService {
  getSnapshot(): NavigationSnapshot;
  /** Update mission overlays without disrupting travel to still-existing locations. */
  replaceWorld(world: WorldMap): void;
  /** Safely rebase at an entry/exit location when changing star systems. */
  setWorld(world: WorldMap, locationId: string): boolean;
  selectDestination(locationId: string | null): NavigationSnapshot;
  selectPointDestination(id: string, position: WorldPoint): NavigationSnapshot;
  startTravel(): NavigationSnapshot;
  startPursuit(targetId: string, targetPosition: WorldPoint): NavigationSnapshot;
  updatePursuitTarget(targetPosition: WorldPoint): NavigationSnapshot;
  stopPursuit(): NavigationSnapshot;
  recoverToNearestDock(): NavigationSnapshot;
  setCruiseSpeed(cruiseSpeed: number, turnRateMultiplier?: number): NavigationSnapshot;
  setRouteProfile(profile: RouteProfile): NavigationSnapshot;
  setThreatContacts(contacts: readonly RouteThreatContact[]): void;
  tick(deltaSeconds: number): NavigationSnapshot;
}
