import type { WorldMap, WorldPoint } from '../../core/world-types';
import type { RoutePlan } from './route-planner';
import { planRouteFromPoint, routeThreatExposure, repointRouteEndpoints } from './route-planner';
import { navigationOrbitalBerth } from './orbital-berth';
import type { NavigationRuntimeState } from './navigation-runtime-types';

/** Keep only the untraveled portion for comparing a moving route with a fresh one. */
function untraveledWaypoints(
  route: RoutePlan,
  travelled: number,
  current: WorldPoint
): WorldPoint[] {
  const points: WorldPoint[] = [{ ...current }];
  let covered = 0;
  for (let i = 1; i < route.points.length; i += 1) {
    const before = route.points[i - 1]!;
    const after = route.points[i]!;
    covered += Math.hypot(after.x - before.x, after.y - before.y);
    if (covered > travelled + 0.001) points.push(after);
  }
  return points;
}

/** Only detour on changed traffic when it materially reduces exposure, preserving travel momentum. */
export function reviewLiveRoute(
  world: WorldMap,
  state: NavigationRuntimeState,
  deltaSeconds: number
): void {
  const travel = state.travel;
  if (!travel || travel.route.profile === 'fast') return;
  state.replanCooldown = Math.max(0, state.replanCooldown - deltaSeconds);
  if (state.replanCooldown > 0 || state.threatRevision === state.lastReplanRevision) return;
  state.replanCooldown = 8;
  state.lastReplanRevision = state.threatRevision;
  if (!world.locations.some((location) => location.id === travel.destinationId)) return;

  const current = state.currentPosition;
  const oldPoints = untraveledWaypoints(travel.route, travel.distanceTravelled, current);
  const previousExposure = routeThreatExposure(oldPoints, state.threats);
  if (previousExposure < 8) return;
  const alternative = repointRouteEndpoints(
    planRouteFromPoint(world, current, travel.destinationId, state.routeProfile, state.threats),
    current,
    navigationOrbitalBerth(world, travel.destinationId)
  );
  const alternativeExposure = routeThreatExposure(alternative.points, state.threats);
  const remaining = Math.max(1, travel.route.distance - travel.distanceTravelled);
  if (alternativeExposure >= previousExposure * 0.72 || alternative.distance > remaining * 1.7)
    return;
  travel.route = alternative;
  travel.distanceTravelled = 0;
}
