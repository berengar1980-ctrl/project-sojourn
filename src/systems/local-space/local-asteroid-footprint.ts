import type { LocalAsteroid } from '../../core/local-space-types';

/** Single collision/navigation radius; nominal radius remains the visual envelope. */
export function localAsteroidContactRadius(
  asteroid: Pick<LocalAsteroid, 'radius' | 'collisionRadius'>
): number {
  return asteroid.collisionRadius ?? asteroid.radius;
}
