import type { NavigationService } from '../systems/navigation';
import type { FuelRoutePlan } from '../systems/navigation/fuel-route-planner';

export interface FuelJourneySnapshot {
  readonly destinationId: string | null;
  readonly remainingIds: readonly string[];
  readonly plannedStops: readonly string[];
}

export interface FuelJourneyService {
  snapshot(): FuelJourneySnapshot;
  plan(): FuelRoutePlan | null;
  start(plan: FuelRoutePlan, navigation: NavigationService): boolean;
  arrived(locationId: string | null, navigation: NavigationService, canContinue: () => boolean): boolean;
  cancel(): void;
}

export function createFuelJourneyService(): FuelJourneyService {
  let active: FuelRoutePlan | null = null;
  let remaining: string[] = [];
  return {
    snapshot() {
      return {
        destinationId: active?.destinationId ?? null,
        remainingIds: [...remaining],
        plannedStops: [...(active?.stopIds ?? [])],
      };
    },
    plan() {
      return active;
    },
    start(plan, navigation) {
      if (plan.legs.length === 0) return false;
      active = plan;
      remaining = plan.legs.map((leg) => leg.destinationId);
      navigation.selectDestination(remaining[0]!);
      navigation.startTravel();
      return true;
    },
    arrived(locationId, navigation, canContinue) {
      if (!active || !locationId || locationId !== remaining[0]) return false;
      remaining.shift();
      if (remaining.length === 0) {
        active = null;
        return false;
      }
      if (!canContinue()) return true;
      navigation.selectDestination(remaining[0]!);
      navigation.startTravel();
      return true;
    },
    cancel() {
      active = null;
      remaining = [];
    },
  };
}
