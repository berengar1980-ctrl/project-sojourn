import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { FieldRouteObstacle } from '../navigation/field-ship-routing';
import { DRONE_SHIELD_RADIUS_METERS } from './security-drone-debris-contact';

/** Patrol drone is a small physical sphere, not a full-sized ship sprite.
 * Separate its shield from route-blocking rocks and nearby ship shields after
 * movement; route avoidance alone does not prevent overlap with moving traffic.
 */
export function resolveSecurityDroneSolidContacts(
  position: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  ships: readonly FieldRouteObstacle[],
  bounds: { readonly width: number; readonly height: number }
): { readonly position: WorldPoint; readonly contacts: number } {
  let x = position.x;
  let y = position.y;
  let contacts = 0;
  const obstacles: readonly FieldRouteObstacle[] = [
    ...asteroids
      .filter((rock) => rock.routeBlocking)
      .map((rock) => ({
        id: rock.id,
        position: rock.position,
        radius: rock.collisionRadius ?? rock.radius,
      })),
    ...ships,
  ];
  // Two passes resolve a drone wedged between a moving ship and a rock.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const obstacle of obstacles) {
      const required = DRONE_SHIELD_RADIUS_METERS + Math.max(0, obstacle.radius);
      const dx = x - obstacle.position.x;
      const dy = y - obstacle.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= required) continue;
      // Stable direction for exactly coincident centres.
      const nx = distance > 0.001 ? dx / distance : 1;
      const ny = distance > 0.001 ? dy / distance : 0;
      x = obstacle.position.x + nx * (required + 0.5);
      y = obstacle.position.y + ny * (required + 0.5);
      contacts += 1;
    }
  }
  return {
    position: {
      x: Math.max(0, Math.min(bounds.width, x)),
      y: Math.max(0, Math.min(bounds.height, y)),
    },
    contacts,
  };
}
