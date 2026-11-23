import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { resolveFieldDebrisContacts } from '../local-space/field-debris-contact';

/** Compact security drone shield contact footprint in world metres. */
export const DRONE_SHIELD_RADIUS_METERS = 18;

/** Keep the original GC-87 contact radius while sharing the same light-debris physics with miners. */
export function resolveSecurityDroneDebrisContacts(
  position: WorldPoint,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[]
): number {
  return resolveFieldDebrisContacts(position, velocity, asteroids, DRONE_SHIELD_RADIUS_METERS);
}
