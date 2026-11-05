import type { WorldPoint } from '../core/world-types';
import type { NavigationSnapshot } from '../systems/navigation/navigation-types';
import type { RoutePlan } from '../systems/navigation/route-planner';
import type { FuelRoutePlan } from '../systems/navigation/fuel-route-planner';

/** Keep only the untraveled geometry of the current leg and the later tank-stop legs. */
function remainingLegPoints(route: RoutePlan, progress: number, position: WorldPoint): WorldPoint[] {
  const distance = Math.max(0, Math.min(1, progress)) * route.distance;
  let passed = 0;
  const points: WorldPoint[] = [{ ...position }];
  for (let i = 1; i < route.points.length; i += 1) {
    const from = route.points[i - 1]!;
    const to = route.points[i]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    passed += length;
    if (passed > distance + 0.001) points.push(to);
  }
  return points;
}

/** The original full itinerary is for forecasting; the map needs the remaining journey. */
export function visibleFuelJourneyRoute(
  journey: FuelRoutePlan,
  remainingIds: readonly string[],
  navigation: NavigationSnapshot
): RoutePlan | null {
  const first = journey.legs.findIndex((leg) => leg.destinationId === remainingIds[0]);
  if (first < 0) return null;
  const remainingLegs = journey.legs.slice(first);
  const currentLeg = remainingLegs[0]!;
  let live: RoutePlan | null = null;
  if (navigation.isTravelling && navigation.destinationId === currentLeg.destinationId) {
    live = navigation.activeRoute;
  }
  let points: WorldPoint[] = [...currentLeg.route.points];
  if (live) {
    points = remainingLegPoints(live, navigation.progress, navigation.currentPosition);
  }
  for (const leg of remainingLegs.slice(1)) {
    points.push(...leg.route.points.slice(1));
  }

  let distance = currentLeg.route.distance;
  if (live) distance = live.distance * (1 - navigation.progress);
  for (const leg of remainingLegs.slice(1)) distance += leg.route.distance;
  return {
    ...journey.route,
    fromId: live ? 'deep-space' : currentLeg.route.fromId,
    points,
    distance,
  };
}
