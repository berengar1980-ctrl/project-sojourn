import type { LocalAsteroid } from '../../core/local-space-types';
import { planPointRoute } from '../local-space/local-space-navigation';
import type { CombatPoint, MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';

const ROUTE_REFRESH_SECONDS = 2;
const REACHED_WAYPOINT_METERS = 100;

function routeObstacles(arena: StrategicCombatArenaOptions): LocalAsteroid[] {
  return (arena.asteroids ?? [])
    .filter((asteroid) => asteroid.kind === 'resource')
    .map((asteroid) => ({
      id: asteroid.id,
      kind: asteroid.kind,
      routeBlocking: true,
      position: asteroid.position,
      radius: asteroid.radius,
    })) as LocalAsteroid[];
}

/** Reuse the campaign's grid navigation, recomputing as asteroids drift. */
export function combatRouteHeading(
  ship: MutableCombatant,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  deltaSeconds: number
): CombatPoint | null {
  if (!(arena.obstacles?.length)) return null;
  ship.nextAsteroidRouteAt = Math.max(0, (ship.nextAsteroidRouteAt ?? 0) - deltaSeconds);
  if (ship.nextAsteroidRouteAt <= 0 || !ship.asteroidRoute?.length) {
    const plan = planPointRoute({
      start: ship.position,
      target,
      asteroids: routeObstacles(arena),
      clearance: Math.max(25, ship.setup.shieldGeometry?.radiusY ?? 30) + 14,
      width: arena.width,
      height: arena.height,
    });
    ship.asteroidRoute = plan.route.slice(1).map((point) => ({ ...point }));
    ship.nextAsteroidRouteAt = ROUTE_REFRESH_SECONDS;
  }
  while (ship.asteroidRoute.length > 1) {
    const waypoint = ship.asteroidRoute[0]!;
    if (Math.hypot(ship.position.x - waypoint.x, ship.position.y - waypoint.y) > REACHED_WAYPOINT_METERS) break;
    ship.asteroidRoute.shift();
  }
  const waypoint = ship.asteroidRoute[0];
  if (!waypoint) return null;
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  return distance > 0.001 ? { x: dx / distance, y: dy / distance } : null;
}
