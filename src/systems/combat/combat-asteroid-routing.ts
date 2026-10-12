import type { LocalAsteroid } from '../../core/local-space-types';
import { planPointRoute } from '../local-space/local-space-navigation';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';

const ROUTE_REFRESH_SECONDS = 0.75;
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

function pathBlocked(
  start: CombatPoint,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  clearance: number
): boolean {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);
  return (arena.obstacles ?? []).some((rock) => {
    const t = Math.max(
      0,
      Math.min(
        1,
        ((rock.position.x - start.x) * dx + (rock.position.y - start.y) * dy) / lengthSquared
      )
    );
    const x = start.x + t * dx - rock.position.x;
    const y = start.y + t * dy - rock.position.y;
    return x * x + y * y < (rock.radius + clearance) ** 2;
  });
}

/** Reuse the campaign's grid navigation, recomputing as asteroids drift. */
export function combatRouteHeading(
  ship: MutableCombatant,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  deltaSeconds: number
): CombatPoint | null {
  if (!arena.obstacles?.length) return null;
  const clearance = Math.max(25, ship.setup.shieldGeometry?.radiusY ?? 30) + 14;
  if (!pathBlocked(ship.position, target, arena, clearance)) {
    ship.asteroidRoute = [];
    return null;
  }
  ship.nextAsteroidRouteAt = Math.max(0, (ship.nextAsteroidRouteAt ?? 0) - deltaSeconds);
  if (ship.nextAsteroidRouteAt <= 0 || !ship.asteroidRoute?.length) {
    const plan = planPointRoute({
      start: ship.position,
      target,
      asteroids: routeObstacles(arena),
      clearance,
      width: arena.width,
      height: arena.height,
    });
    ship.asteroidRoute = plan.route.slice(1).map((point) => ({ ...point }));
    ship.nextAsteroidRouteAt = ROUTE_REFRESH_SECONDS;
  }
  const route = ship.asteroidRoute ?? [];
  while (route.length > 0) {
    const waypoint = route[0]!;
    if (
      Math.hypot(ship.position.x - waypoint.x, ship.position.y - waypoint.y) >
      Math.max(
        32,
        Math.min(REACHED_WAYPOINT_METERS, (ship.setup.shieldGeometry?.radiusX ?? 30) * 1.5)
      )
    )
      break;
    route.shift();
  }
  const waypoint = route[0];
  if (!waypoint) return null;
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  return distance > 0.001 ? { x: dx / distance, y: dy / distance } : null;
}
