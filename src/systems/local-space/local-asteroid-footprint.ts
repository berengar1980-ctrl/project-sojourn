import type { LocalAsteroid } from '../../core/local-space-types';
import type { FieldRouteObstacle } from '../../core/field-traffic-types';

/** Single collision/navigation radius; nominal radius remains the visual envelope. */
export function localAsteroidContactRadius(
  asteroid: Pick<LocalAsteroid, 'radius' | 'collisionRadius'>
): number {
  return asteroid.collisionRadius ?? asteroid.radius;
}

/** Solid circle approximation only; debris and actual contour physics remain separate. */
export function solidFieldRockObstacles(rocks: readonly LocalAsteroid[]): FieldRouteObstacle[] {
  return rocks
    .filter((rock) => rock.routeBlocking)
    .map((rock) => ({
      id: rock.id,
      position: rock.position,
      radius: localAsteroidContactRadius(rock),
    }));
}
