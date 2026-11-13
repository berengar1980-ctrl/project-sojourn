import type { WorldPoint } from '../../core/world-types';
import type { RoutePlan, RouteProfile, RouteThreatContact } from './route-planner';

export interface TravelState {
  destinationId: string;
  route: RoutePlan;
  distanceTravelled: number;
  currentSpeed: number;
}

export interface PursuitState {
  targetId: string;
  targetPosition: WorldPoint;
  currentSpeed: number;
}

export interface NavigationRuntimeState {
  currentLocationId: string | null;
  pointDestination: { readonly id: string; readonly position: WorldPoint } | null;
  selectedDestinationId: string | null;
  currentPosition: WorldPoint;
  currentHeading: number;
  currentTurnRate: number;
  currentAngularThrust: number;
  travel: TravelState | null;
  pursuit: PursuitState | null;
  cruiseSpeed: number;
  turnRateMultiplier: number;
  routeProfile: RouteProfile;
  threats: readonly RouteThreatContact[];
  threatSignature: string;
  threatRevision: number;
  lastReplanRevision: number;
  replanCooldown: number;
  previewCache: { readonly key: string; readonly plan: RoutePlan } | null;
}

