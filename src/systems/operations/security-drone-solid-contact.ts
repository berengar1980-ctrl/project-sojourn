import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { contactAxis } from '../../core/field-geometry';
import { circularContactMass } from '../../core/ship-contact-mass';
import { resolveContactImpulse, separateContactBodies } from '../../core/contact-impulse';
import { applyAngularImpulseAtPoint, rotationalMassTerm } from '../local-space/local-space-physics';
import type { FieldRouteObstacle } from '../navigation/field-ship-routing';
import { DRONE_SHIELD_RADIUS_METERS } from './security-drone-debris-contact';

/** Resolve solid drone contacts with the same mass-aware normal impulse as field rocks. */
export function resolveSecurityDroneSolidContacts(
  position: WorldPoint,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  ships: readonly FieldRouteObstacle[],
  bounds: { readonly width: number; readonly height: number }
): {
  readonly position: WorldPoint;
  readonly velocity: WorldPoint;
  readonly contacts: number;
} {
  const droneMass = circularContactMass(DRONE_SHIELD_RADIUS_METERS);
  let contacts = 0;
  for (const rock of asteroids) {
    if (!rock.routeBlocking) continue;
    const dx = rock.position.x - position.x;
    const dy = rock.position.y - position.y;
    const { distance, normal } = contactAxis(dx, dy);
    const overlap = DRONE_SHIELD_RADIUS_METERS + (rock.collisionRadius ?? rock.radius) - distance;
    if (overlap <= 0) continue;
    const droneBody = { position, velocity, mass: droneMass };
    const rockBody = {
      position: rock.position,
      velocity: rock.physics.velocity,
      mass: rock.physics.mass,
    };
    const contactPoint = {
      x: rock.position.x - normal.x * (rock.collisionRadius ?? rock.radius),
      y: rock.position.y - normal.y * (rock.collisionRadius ?? rock.radius),
    };
    separateContactBodies(droneBody, rockBody, normal, overlap + 0.5);
    const closingSpeed =
      (droneBody.velocity.x - rockBody.velocity.x) * normal.x +
      (droneBody.velocity.y - rockBody.velocity.y) * normal.y;
    if (closingSpeed > 0) {
      const impulse = resolveContactImpulse(
        droneBody,
        rockBody,
        normal,
        closingSpeed * 0.1,
        rotationalMassTerm(rock, contactPoint, normal)
      );
      applyAngularImpulseAtPoint(
        rock,
        { x: normal.x * impulse, y: normal.y * impulse },
        contactPoint
      );
    }
    contacts += 1;
  }

  // Traffic routes are kinematic from the drone's perspective; retain their live velocity
  // in the relative-speed calculation while leaving their owner responsible for response.
  for (const ship of ships) {
    const dx = ship.position.x - position.x;
    const dy = ship.position.y - position.y;
    const { distance, normal } = contactAxis(dx, dy);
    const overlap = DRONE_SHIELD_RADIUS_METERS + Math.max(0, ship.radius) - distance;
    if (overlap <= 0) continue;
    const droneBody = { position, velocity, mass: droneMass };
    const shipBody = {
      position: { ...ship.position },
      velocity: { ...(ship.velocity ?? { x: 0, y: 0 }) },
      mass: 1e30,
    };
    separateContactBodies(droneBody, shipBody, normal, overlap + 0.5);
    const closingSpeed =
      (velocity.x - shipBody.velocity.x) * normal.x + (velocity.y - shipBody.velocity.y) * normal.y;
    if (closingSpeed > 0) resolveContactImpulse(droneBody, shipBody, normal, closingSpeed * 0.1);
    contacts += 1;
  }

  return {
    position: {
      x: Math.max(0, Math.min(bounds.width, position.x)),
      y: Math.max(0, Math.min(bounds.height, position.y)),
    },
    velocity: { ...velocity },
    contacts,
  };
}
