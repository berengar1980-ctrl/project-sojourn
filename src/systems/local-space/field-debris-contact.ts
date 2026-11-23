import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

/** Shared light-debris response for noncombat field traffic.
 * Large route-blocking rocks remain solid obstacles; small drifting fragments
 * receive an outward impulse instead of pinning a ship against its own route.
 */
export function resolveFieldDebrisContacts(
  position: WorldPoint,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  shieldRadius: number
): number {
  let contacts = 0;
  for (const rock of asteroids) {
    if (rock.kind !== 'debris' || rock.routeBlocking || !rock.physics) continue;
    const radius = Math.max(0, shieldRadius) + (rock.collisionRadius ?? rock.radius);
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
    const relative =
      (velocity.x - rock.physics.velocity.x) * nx + (velocity.y - rock.physics.velocity.y) * ny;
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
