import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

/** Compact security drone shield contact footprint in world metres. */
export const DRONE_SHIELD_RADIUS_METERS = 18;

/** Small non-route-blocking debris still has real contact physics.
 * Displace the lighter rock rather than teleporting the security drone.
 */
export function resolveSecurityDroneDebrisContacts(
  position: WorldPoint,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[]
): number {
  let contacts = 0;
  for (const rock of asteroids) {
    if (rock.routeBlocking) continue;
    const radius = DRONE_SHIELD_RADIUS_METERS + (rock.collisionRadius ?? rock.radius);
    const dx = rock.position.x - position.x;
    const dy = rock.position.y - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= radius) continue;
    const nx = distance > 0.001 ? dx / distance : 1;
    const ny = distance > 0.001 ? dy / distance : 0;
    const penetration = radius - distance + 0.5;
    rock.position = {
      x: rock.position.x + nx * penetration,
      y: rock.position.y + ny * penetration,
    };
    const relative = (velocity.x - rock.physics.velocity.x) * nx +
      (velocity.y - rock.physics.velocity.y) * ny;
    const kick = Math.max(5, relative * 1.15);
    rock.physics.velocity = {
      x: rock.physics.velocity.x + nx * kick,
      y: rock.physics.velocity.y + ny * kick,
    };
    rock.physics.angularVelocity += (nx - ny) * Math.min(1.8, kick * 0.008);
    contacts++;
  }
  return contacts;
}
