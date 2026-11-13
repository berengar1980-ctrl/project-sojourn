import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';
import type { RoutePlan, RouteThreatContact } from './route-planner';
import { routeThreatExposure } from './route-planner';

/** Protected approach perimeter around populated, low-danger civilian ports. */
export function safeDestinationRadius(location: Pick<WorldLocation, 'dangerLevel' | 'stationType' | 'kind' | 'activities' | 'radius'>): number {
  if (location.dangerLevel > 1 || location.stationType === 'pirate') return 0;
  if (!['planet', 'moon', 'station'].includes(location.kind)) return 0;
  if (!location.activities.dock && !location.activities.refuel) return 0;
  return Math.max(135, Math.min(230, location.radius * 3.5));
}

export function protectedBySafeDestination(world: WorldMap, point: WorldPoint): boolean {
  return world.locations.some((location) => {
    const radius = safeDestinationRadius(location);
    return radius > 0 && Math.hypot(point.x - location.position.x, point.y - location.position.y) <= radius;
  });
}

/** Player-relative assessment: geographic risk is fixed, only the captain's exposure changes. */
export function assessRouteRisk(
  route: RoutePlan,
  contacts: readonly RouteThreatContact[],
  defense: { readonly hull: number; readonly shield: number; readonly piloting: number; readonly sensors: number }
): { readonly tier: 'low' | 'medium' | 'high'; readonly score: number; readonly contactCount: number } {
  const exposure = routeThreatExposure(route.points, contacts);
  const pressure = exposure / Math.max(300, route.distance);
  const capability = 0.45 +
    Math.min(2, Math.sqrt(Math.max(1, defense.hull) / 100) * 0.4) +
    Math.min(2, Math.sqrt(Math.max(1, defense.shield) / 100) * 0.28) +
    Math.min(0.7, (Math.max(0, defense.piloting) + Math.max(0, defense.sensors)) / 250);
  const score = Math.max(0, route.dangerLevel + pressure * 1.3 - capability);
  return {
    tier: score < 0.7 ? 'low' : score < 1.65 ? 'medium' : 'high',
    score: Math.round(score * 100) / 100,
    contactCount: contacts.filter((contact) => contact.kind === 'pirate').length,
  };
}
