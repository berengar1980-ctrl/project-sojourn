import { DRONE_SHIELD_RADIUS_METERS } from '../../core/security-drone';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { circularContactMass } from '../../core/ship-contact-mass';
import { resolveFieldDebrisContacts } from '../local-space/field-debris-contact';

export { DRONE_SHIELD_RADIUS_METERS } from '../../core/security-drone';

/** Keep the original GC-87 contact radius while sharing the same light-debris physics with miners. */
export function resolveSecurityDroneDebrisContacts(
  position: WorldPoint,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[]
): number {
  return resolveFieldDebrisContacts(
    position,
    velocity,
    asteroids,
    DRONE_SHIELD_RADIUS_METERS,
    circularContactMass(DRONE_SHIELD_RADIUS_METERS)
  );
}
